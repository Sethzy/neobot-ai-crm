/**
 * Isolated run_subagent tool for offloading work outside the parent context.
 * @module lib/runner/tools/subagents/run-subagent
 */
import { generateText, stepCountIs, tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import type { CrmVocabConfig } from "@/lib/crm/config";
import { assembleSystemOnly } from "@/lib/runner/context";
import { completeRun, createSubagentRun } from "@/lib/runner/run-lifecycle";
import { createRunnerTools } from "@/lib/runner/tool-registry";
import { saveToolcallBlock } from "@/lib/runner/toolcall-artifacts";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

const MAX_SUBAGENT_STEPS = 9;
const SUBAGENT_TIMEOUT_MS = 120_000;
const SUBAGENT_STEP_TIMEOUT_MS = 30_000;

type ChatSupabaseClient = SupabaseClient<Database>;

const runSubagentInputSchema = z.object({
  action_pending: z.string().min(1),
  action_finished: z.string().min(1),
  action_error: z.string().min(1),
  path: z.string().min(1),
  payload: z.string().optional(),
});

interface CreateSubagentToolOptions {
  parentRunId: string;
  crmConfig?: CrmVocabConfig;
  crmMode?: "normal" | "setup";
}

interface StepLike {
  toolCalls?: ReadonlyArray<Record<string, unknown>>;
  toolResults?: ReadonlyArray<Record<string, unknown>>;
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
        "Runs a subagent to handle work efficiently outside of your main context. " +
        "Returns the final message from the subagent as its result.",
      inputSchema: runSubagentInputSchema,
      execute: async ({ path, payload }, { abortSignal }) => {
        const { runId } = await createSubagentRun(supabase, {
          threadId,
          clientId,
          parentRunId: options.parentRunId,
        });

        try {
          const fileClient = createAgentFileClient(supabase, clientId);
          let instructionMarkdown: string;

          try {
            instructionMarkdown = await fileClient.downloadFile(path);
          } catch {
            throw new Error(`Instruction file not found: ${path}`);
          }

          if (instructionMarkdown.trim().length === 0) {
            throw new Error(`Instruction file is empty: ${path}`);
          }

          const system = await assembleSystemOnly({
            supabase,
            clientId,
            threadId,
            crmConfig: options.crmConfig,
            crmMode: options.crmMode ?? "normal",
          });
          const tools = createRunnerTools(supabase, clientId, threadId, {
            allowTriggerMutations: false,
            allowConnectionMutations: false,
            isSubagent: true,
            includeSendMessage: false,
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
            tools,
            stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
            abortSignal,
            timeout: {
              totalMs: SUBAGENT_TIMEOUT_MS,
              stepMs: SUBAGENT_STEP_TIMEOUT_MS,
            },
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
      (step.toolResults ?? []).flatMap((toolResult) => {
        const toolCallId = typeof toolResult.toolCallId === "string"
          ? toolResult.toolCallId
          : null;

        if (!toolCallId) {
          return [];
        }

        return [[toolCallId, toolResult.output]];
      }),
    );

    for (const toolCall of step.toolCalls ?? []) {
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
