/**
 * Runner core loop entrypoint for streaming model calls.
 * @module lib/runner/run-agent
 */
import { stepCountIs, streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { createMessages } from "@/lib/chat/messages";
import { assembleContext } from "@/lib/runner/context";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import {
  buildAssistantPartsFromSteps,
  getAssistantTextFromParts,
} from "@/lib/runner/message-utils";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
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
      prepareStep: ({ stepNumber }) => {
        // On the final step, disable tools to force a text response.
        // Without this, the model can exhaust all steps on tool calls
        // and the stream ends with zero text output.
        if (stepNumber >= MAX_STEPS_TIER_1 - 1) {
          return { activeTools: [] };
        }
      },
      onFinish: async ({ text, steps, totalUsage }) => {
        const parts = buildAssistantPartsFromSteps(steps);
        const contentTextFromParts = getAssistantTextFromParts(parts);
        const fallbackContentText = typeof text === "string" ? text.trim() : "";
        const contentText =
          contentTextFromParts.length > 0 ? contentTextFromParts : fallbackContentText;
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
