/**
 * Runner core loop entrypoint for streaming model calls.
 * @module lib/runner/run-agent
 */
import { stepCountIs, streamText } from "ai";
import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { createMessages } from "@/lib/chat/messages";
import { assembleContext } from "@/lib/runner/context";
import { drainAndContinue } from "@/lib/runner/drain-and-continue";
import { extractTextContent } from "@/lib/runner/message-utils";
import { completeRun, createRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";
import type { RunnerPayload } from "@/lib/runner/schemas";
import { createCrmTools, createStorageTools, createWebTools } from "@/lib/runner/tools";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database";

const MAX_STEPS_TIER_1 = 8;

type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createWebTools>;
type StreamResult = ReturnType<typeof streamText<RunnerTools>>;

function createTextParts(text: string): Json {
  return [{ type: "text", text }];
}

function getAssistantRowsFromResponseMessages(
  messages: unknown,
  threadId: string,
): Array<{ thread_id: string; role: string; content: string; parts: Json }> {
  if (!Array.isArray(messages)) {
    return [];
  }

  const rows = messages
    .filter(
      (message): message is { role: string; content?: unknown } =>
        typeof message === "object" && message !== null && "role" in message,
    )
    .filter((message) => message.role === "assistant")
    .map((message) => {
      const text = extractTextContent(message.content);
      return {
        thread_id: threadId,
        role: "assistant",
        content: text,
        parts: createTextParts(text),
      };
    })
    .filter((row) => row.content.length > 0);

  return rows;
}

export type RunAgentResult =
  | { status: "streaming"; streamResult: StreamResult }
  | { status: "queued" };

/**
 * Executes one thread run if no active run exists, otherwise queues the input.
 */
export async function runAgent(
  payload: RunnerPayload,
  supabase: AppSupabaseClient,
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
    const [, { system, messages }] = await Promise.all([
      createMessages(supabase, [
        {
          thread_id: threadId,
          role: "user",
          content: input,
          parts: createTextParts(input),
        },
      ]),
      assembleContext({
        supabase,
        threadId,
        currentMessage: input,
      }),
    ]);
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
      onFinish: async ({ text, response, steps, totalUsage }) => {
        const assistantRowsFromResponse = getAssistantRowsFromResponseMessages(
          response?.messages,
          threadId,
        );

        if (assistantRowsFromResponse.length > 0) {
          await createMessages(supabase, assistantRowsFromResponse);
        } else {
          const assistantText = typeof text === "string" ? text.trim() : "";
          if (assistantText.length > 0) {
            await createMessages(supabase, [
              {
                thread_id: threadId,
                role: "assistant",
                content: assistantText,
                parts: createTextParts(assistantText),
              },
            ]);
          }
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
