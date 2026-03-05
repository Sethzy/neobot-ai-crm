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
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import type { RunnerPayload } from "@/lib/runner/schemas";
import { createCrmTools, createStorageTools, createWebTools } from "@/lib/runner/tools";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import type { Database, Json } from "@/types/database";

const MAX_STEPS_TIER_1 = 9;

type ChatSupabaseClient = SupabaseClient<Database>;
type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createWebTools>;
type StreamResult = ReturnType<typeof streamText<RunnerTools>>;

function createTextParts(text: string): Json {
  return [{ type: "text", text }];
}

/**
 * Reconstructs UIMessage-compatible parts from streamText step results.
 * Preserves tool-invocation parts so the chat UI can render step details
 * (tool names, arguments, results) after page reloads.
 */
function buildAssistantParts(
  steps: Array<{
    toolCalls: Array<{ toolCallId: string; toolName: string; args?: unknown }>;
    toolResults: Array<{ toolCallId: string; result?: unknown }>;
    text: string;
  }>,
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];

  for (const step of steps) {
    parts.push({ type: "step-start" });

    for (const toolCall of step.toolCalls) {
      const toolResult = step.toolResults.find(
        (r) => r.toolCallId === toolCall.toolCallId,
      );
      parts.push({
        type: "tool-invocation",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.args ?? {},
        state: toolResult ? "result" : "call",
        ...(toolResult ? { result: toolResult.result ?? null } : {}),
      });
    }

    if (step.text.trim().length > 0) {
      parts.push({ type: "text", text: step.text.trim() });
    }
  }

  return parts;
}

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
    await createMessages(supabase, [
      {
        thread_id: threadId,
        role: "user",
        content: input,
        parts: createTextParts(input),
      },
    ]);

    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: "",
    });
    const crmTools = createCrmTools(supabase, clientId, {
      allowWriteTools: true,
    });
    const storageTools = createStorageTools(supabase, clientId);
    const webTools = createWebTools();
    const tools = {
      ...crmTools,
      ...storageTools,
      ...webTools,
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
        const parts = buildAssistantParts(steps);
        const contentText = typeof text === "string" ? text.trim() : "";

        if (parts.length > 0 || contentText.length > 0) {
          await createMessages(supabase, [
            {
              thread_id: threadId,
              role: "assistant",
              content: contentText,
              parts: parts.length > 0 ? (parts as Json) : createTextParts(contentText),
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
