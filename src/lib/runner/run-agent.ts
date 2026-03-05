/**
 * Runner core loop entrypoint for streaming model calls.
 * @module lib/runner/run-agent
 */
import { stepCountIs, streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { createMessages } from "@/lib/chat/messages";
import {
  CRM_COMPACTION_INSTRUCTIONS,
  maybeCompactThread,
} from "@/lib/runner/compaction";
import { assembleContext } from "@/lib/runner/context";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import {
  buildAssistantPartsFromSteps,
  getAssistantTextFromParts,
} from "@/lib/runner/message-utils";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import type { RunnerPayload } from "@/lib/runner/schemas";
import { truncateOversizedParts } from "@/lib/runner/toolcall-artifacts";
import {
  createCrmTools,
  createStorageTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import type { Database, Json } from "@/types/database";

const MAX_STEPS_TIER_1 = 9;

type ChatSupabaseClient = SupabaseClient<Database>;
type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createUtilityTools> &
  ReturnType<typeof createWebTools>;
type StreamResult = ReturnType<typeof streamText<RunnerTools>>;

export type RunAgentResult =
  | { status: "streaming"; streamResult: StreamResult }
  | { status: "queued" };

function isAnthropicModel(modelId: string): boolean {
  return /^anthropic[/:]/.test(modelId);
}

function appendArtifactRecoveryNote(
  contentText: string,
  recoveryPaths: string[],
): string {
  if (recoveryPaths.length === 0) {
    return contentText;
  }

  const recoveryNote = [
    "Full tool results were truncated from persisted context. Recover them with read_file if needed:",
    ...recoveryPaths.map((path) => `- ${path}`),
  ].join("\n");

  return [contentText, recoveryNote]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join("\n\n")
    .trim();
}

/**
 * Builds per-step overrides for the active model.
 * Anthropic models receive native context-management compaction hints.
 */
export function buildPrepareStep(modelId: string) {
  const shouldUseAnthropicCompaction = isAnthropicModel(modelId);

  return ({ stepNumber }: { stepNumber: number }) => {
    const result: Record<string, unknown> = {};

    if (stepNumber >= MAX_STEPS_TIER_1 - 1) {
      result.activeTools = [];
    }

    if (shouldUseAnthropicCompaction) {
      result.providerOptions = {
        anthropic: {
          contextManagement: {
            edits: [
              {
                type: "compact_20260112",
                trigger: { type: "input_tokens", value: 50_000 },
                instructions: CRM_COMPACTION_INSTRUCTIONS,
                pauseAfterCompaction: false,
              },
            ],
          },
        },
      };
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };
}

/**
 * Executes one thread run if no active run exists, otherwise queues the input.
 */
export async function runAgent(
  payload: RunnerPayload,
  supabase: ChatSupabaseClient,
): Promise<RunAgentResult> {
  const { clientId, threadId, input } = payload;
  const modelId = TIER_1_MODEL;

  await markStaleRunsFailed(supabase, { threadId, staleMinutes: 15 });

  const lockResult = await createRun(supabase, { threadId, clientId });
  if (!lockResult.created) {
    await enqueueMessage(supabase, {
      threadId,
      clientId,
      content: input,
      channel: "web",
    });
    return { status: "queued" };
  }

  try {
    if (payload.triggerType !== "cron") {
      await createMessages(supabase, [
        {
          thread_id: threadId,
          role: "user",
          content: input,
          parts: [{ type: "text", text: input }] as Json,
        },
      ]);
    }

    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
      clientId,
    });
    const crmTools = createCrmTools(supabase, clientId, {
      allowWriteTools: true,
    });
    const storageTools = createStorageTools(supabase, clientId);
    const webTools = createWebTools();
    const utilityTools = createUtilityTools(supabase, clientId, threadId);
    const tools = {
      ...crmTools,
      ...storageTools,
      ...webTools,
      ...utilityTools,
    };

    const streamResult = streamText({
      model: gateway(modelId),
      system,
      messages,
      stopWhen: stepCountIs(MAX_STEPS_TIER_1),
      tools,
      prepareStep: buildPrepareStep(modelId),
      onFinish: async ({ text, steps, totalUsage }) => {
        const rawParts = buildAssistantPartsFromSteps(steps);
        let parts = rawParts;
        let recoveryPaths: string[] = [];

        try {
          const truncatedResult = await truncateOversizedParts(
            supabase,
            clientId,
            rawParts,
          );
          parts = truncatedResult.parts;
          recoveryPaths = truncatedResult.recoveryPaths;
        } catch (artifactError) {
          console.error("[runner] toolcall artifact persistence failed:", artifactError);
        }

        const contentTextFromParts = getAssistantTextFromParts(parts);
        const fallbackContentText = typeof text === "string" ? text.trim() : "";
        const contentText = appendArtifactRecoveryNote(
          contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText,
          recoveryPaths,
        );
        const hasNonStepParts = parts.some((part) => part.type !== "step-start");

        if (hasNonStepParts || contentText.length > 0) {
          await createMessages(supabase, [
            {
              thread_id: threadId,
              role: "assistant",
              content: contentText,
              parts: hasNonStepParts
                ? (parts as Json)
                : ([{ type: "text", text: contentText }] as Json),
            },
          ]);
        }

        await completeRun(supabase, {
          runId: lockResult.runId,
          status: "completed",
          model: modelId,
          tokensIn: totalUsage.inputTokens ?? 0,
          tokensOut: totalUsage.outputTokens ?? 0,
          stepCount: steps.length,
        });
        await drainAndContinue(supabase, { clientId, threadId });
        void maybeCompactThread(supabase, clientId, threadId).catch((compactionError) => {
          console.error("[runner] post-run compaction failed:", compactionError);
        });
      },
    });

    return { status: "streaming", streamResult };
  } catch (error) {
    await completeRun(supabase, {
      runId: lockResult.runId,
      status: "failed",
      model: modelId,
      tokensIn: 0,
      tokensOut: 0,
    });
    throw error;
  }
}
