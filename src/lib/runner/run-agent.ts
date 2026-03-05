/**
 * Runner core loop entrypoint for streaming model calls.
 * @module lib/runner/run-agent
 */
import { stepCountIs, streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { createMessages } from "@/lib/chat/messages";
import { CRM_COMPACTION_INSTRUCTIONS } from "@/lib/runner/compaction";
import { assembleContext } from "@/lib/runner/context";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import { finalizeRun } from "@/lib/runner/run-persistence";
import type { RunnerPayload } from "@/lib/runner/schemas";
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

/**
 * Creates the full tool registry for one runner invocation.
 */
export function createRunnerTools(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
) {
  const crmTools = createCrmTools(supabase, clientId, {
    allowWriteTools: true,
  });
  const storageTools = createStorageTools(supabase, clientId);
  const webTools = createWebTools();
  const utilityTools = createUtilityTools(supabase, clientId, threadId);

  return {
    ...crmTools,
    ...storageTools,
    ...webTools,
    ...utilityTools,
  };
}

/**
 * Builds per-step overrides for the active model.
 * Anthropic models receive native context-management compaction hints.
 */
export function buildPrepareStep(modelId: string, maxSteps = MAX_STEPS_TIER_1) {
  const shouldUseAnthropicCompaction = isAnthropicModel(modelId);

  return ({ stepNumber }: { stepNumber: number }) => {
    const result: Record<string, unknown> = {};

    if (stepNumber >= maxSteps - 1) {
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
    const tools = createRunnerTools(supabase, clientId, threadId);

    const streamResult = streamText({
      model: gateway(modelId),
      system,
      messages,
      stopWhen: stepCountIs(MAX_STEPS_TIER_1),
      tools,
      prepareStep: buildPrepareStep(modelId),
      onFinish: async ({ text, steps, totalUsage }) => {
        await finalizeRun({
          supabase,
          clientId,
          threadId,
          runId: lockResult.runId,
          modelId,
          steps,
          text,
          totalUsage,
          logLabel: "runner",
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
