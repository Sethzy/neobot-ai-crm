/**
 * Isolated run_subagent tool for offloading work outside the parent context.
 * @module lib/runner/tools/subagents/run-subagent
 */
import { generateText, stepCountIs, tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { gateway, gatewayProviderOptions, TIER_1_MODEL } from "@/lib/ai/gateway";
import type { CrmVocabConfig } from "@/lib/crm/config";
import { assembleSystemOnly } from "@/lib/runner/context";
import { completeRun, createSubagentRun } from "@/lib/runner/run-lifecycle";
import { createRunnerTools } from "@/lib/runner/tool-registry";
import type { StepLike } from "@/lib/runner/message-utils";
import { saveToolcallBlock } from "@/lib/storage/tool-blocks";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import { toStoragePath } from "@/lib/storage/agent-paths";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import type { Database } from "@/types/database";

const MAX_SUBAGENT_STEPS = 9;
const SUBAGENT_TIMEOUT_MS = 120_000;
const SUBAGENT_STEP_TIMEOUT_MS = 30_000;

type ChatSupabaseClient = SupabaseClient<Database>;

const runSubagentInputSchema = z.object({
  path: z.string().min(1).describe("Full path to the subagent markdown file (e.g., \"/agent/subagents/email_processor.md\")"),
  payload: z.string().optional().describe("Optional data to pass to the subagent that will be added after the subagent's instructions in the first user message. This allows the same subagent to process different inputs."),
});

interface CreateSubagentToolOptions {
  parentRunId: string;
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
}

/**
 * Creates the isolated run_subagent tool for one parent run.
 */
export function createSubagentTool(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
  options: CreateSubagentToolOptions,
) {
  return {
    run_subagent: tool({
      description:
        "Runs a subagent to handle work efficiently outside of your main context. Returns the final message from the subagent as its result.\nRunning subagents reduces costs and keeps your context focused. This is especially useful when you are doing similar work multiple times.\n\nThe subagent receives the content of the markdown file followed by any payload data you provide in the first user message.\n\nBefore running a subagent, consider whether the subagent's approach still fits the current situation - you can always update its file with write_file if needed.",
      inputSchema: runSubagentInputSchema,
      execute: async ({ path, payload }, { abortSignal }) => {
        const { runId } = await createSubagentRun(supabase, {
          threadId,
          clientId,
          parentRunId: options.parentRunId,
        });

        try {
          const internalPath = toStoragePath(path);
          const fileClient = createAgentFileClient(supabase, clientId);

          const [instructionMarkdown, system] = await Promise.all([
            fileClient.downloadFile(internalPath).catch(() => {
              throw new Error(`Instruction file not found: ${path}`);
            }),
            assembleSystemOnly({
              supabase,
              clientId,
              threadId,
              crmConfig: options.crmConfig,
              crmMode: options.crmMode ?? "normal",
              includeMarketData: isPropertySupabaseConfigured(),
              includePropertyListings: false,
            }),
          ]);

          if (instructionMarkdown.trim().length === 0) {
            throw new Error(`Instruction file is empty: ${path}`);
          }
          const runnerTools = createRunnerTools(supabase, clientId, threadId, {
            allowTriggerMutations: false,
            allowConnectionMutations: false,
            isSubagent: true,
            includeSendMessage: false,
            includeBrowserTools: false,
            includeMarketTools: true,
            includeListingTools: false,
            crmConfig: options.crmConfig,
            crmMode: options.crmMode ?? "normal",
          });
          const userMessage = payload
            ? `${instructionMarkdown}\n\n${payload}`
            : instructionMarkdown;
          const result = await generateText({
            model: gateway(TIER_1_MODEL),
            system,
            messages: [{ role: "user", content: userMessage }],
            tools: runnerTools,
            stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
            abortSignal,
            timeout: {
              totalMs: SUBAGENT_TIMEOUT_MS,
              stepMs: SUBAGENT_STEP_TIMEOUT_MS,
            },
            providerOptions: gatewayProviderOptions,
            experimental_telemetry: { isEnabled: true },
          });

          await persistSubagentBlocks(supabase, clientId, runId, path, payload, result.steps);
          await completeRun(supabase, {
            runId,
            status: "completed",
            model: TIER_1_MODEL,
            tokensIn: result.totalUsage.inputTokens ?? 0,
            tokensOut: result.totalUsage.outputTokens ?? 0,
            stepCount: result.steps.length,
          });

          return result.text;
        } catch (error) {
          await completeRun(supabase, {
            runId,
            status: "failed",
            model: TIER_1_MODEL,
            tokensIn: 0,
            tokensOut: 0,
          });
          throw error;
        }
      },
    }),
  };
}

async function persistSubagentBlocks(
  supabase: ChatSupabaseClient,
  clientId: string,
  runId: string,
  path: string,
  payload: string | undefined,
  steps: ReadonlyArray<StepLike>,
): Promise<void> {
  const uploads: Promise<void>[] = [];

  for (const step of steps) {
    const toolResultMap = new Map(
      (step.toolResults ?? []).flatMap((raw) => {
        const toolResult = raw as Record<string, unknown>;
        const toolCallId = typeof toolResult.toolCallId === "string"
          ? toolResult.toolCallId
          : null;

        if (!toolCallId) {
          return [];
        }

        return [[toolCallId, toolResult.output]];
      }),
    );

    for (const raw of step.toolCalls ?? []) {
      const toolCall = raw as Record<string, unknown>;
      const toolCallId = typeof toolCall.toolCallId === "string"
        ? toolCall.toolCallId
        : null;

      if (!toolCallId) {
        continue;
      }

      uploads.push(
        saveToolcallBlock(
          supabase,
          clientId,
          toolCallId,
          toolCall.input,
          toolResultMap.get(toolCallId),
        ),
      );
    }
  }

  uploads.push(
    saveToolcallBlock(
      supabase,
      clientId,
      runId,
      { path, payload },
      { steps },
    ),
  );

  await Promise.all(uploads);
}
