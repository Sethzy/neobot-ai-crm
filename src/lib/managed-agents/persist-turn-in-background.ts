/**
 * Background persistence worker for the `POST /api/chat/send` endpoint.
 *
 * Subscribes to the Anthropic session after a `user.message` has been
 * sent, accumulates events for one turn (until `status_idle` /
 * `status_terminated`), and on terminal persists the assistant output,
 * completes the run row, and runs evaluators.
 *
 * Runs in parallel with the browser-side `/api/chat/stream` subscription.
 * Two subscribers on the same session is fine — Anthropic's streams are
 * read-only fan-outs.
 *
 * @module lib/managed-agents/persist-turn-in-background
 */
import type Anthropic from "@anthropic-ai/sdk";

import { upsertMessage } from "@/lib/chat/messages";
import { deliverToExternalChannels } from "@/lib/channels/deliver";
import { runEvaluatorsForEvents } from "@/lib/eval/run-evaluators";
import { completeRun, createRunRecord } from "@/lib/runner/run-lifecycle";
import { getAssistantTextFromParts } from "@/lib/runner/message-utils";
import type { Json } from "@/types/database";

import { accumulateModelUsage, computeTurnCost, emptyUsage } from "./adapter-cost";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import { iterateSessionEventsAfter } from "./session-reconnect";
import { pickSourceEventId } from "./source-event-id";
import type { ManagedSupabaseClient } from "./types";

import { resolveAgentRef } from "./agent-config";
import type { AnthropicEvent } from "./event-types";
import type { SessionTailHandle } from "./session-reconnect";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

export interface PersistTurnInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  sessionId: string;
  conversationInput: string;
  tailHandle: SessionTailHandle;
  /** User-facing model ID (e.g. `"anthropic/claude-sonnet-4-6"`). Used for
   *  cost tracking and run labelling. Falls back to Sonnet when omitted. */
  selectedChatModel?: string;
}

/**
 * Subscribe to one turn's worth of events, then persist the result.
 *
 * Designed to be called from `after()` inside a Vercel route handler so
 * it runs after the response is sent. Returns a Promise that resolves
 * when persistence is complete (or fails with a caught error).
 */
export async function persistTurnInBackground(
  input: PersistTurnInput,
): Promise<void> {
  let runId: string | null = null;
  const anthropicModelId = input.selectedChatModel
    ? resolveAgentRef(input.selectedChatModel).anthropicModelId
    : DEFAULT_ANTHROPIC_MODEL;

  try {
    runId = await createRunRecord(input.supabase, {
      threadId: input.threadId,
      clientId: input.clientId,
      runType: "chat",
      sessionId: input.sessionId,
      model: anthropicModelId,
    });

    const events: unknown[] = [];
    const usage = emptyUsage();
    let userMessageCount = 0;

    for await (const event of iterateSessionEventsAfter(
      input.anthropic as Anthropic,
      input.sessionId,
      input.tailHandle,
    )) {
      events.push(event);

      const typed = event as {
        type?: string;
        model_usage?: unknown;
      };

      if (typed.type === "user.message") {
        userMessageCount += 1;
        if (userMessageCount > 1) {
          await completeRun(input.supabase, {
            runId,
            status: "cancelled",
            model: anthropicModelId,
            tokensIn: usage.inputTokens,
            tokensOut: usage.outputTokens,
            cacheReadTokens: usage.cacheReadInputTokens,
          });
          return;
        }
      }

      if (typed.type === "span.model_request_end") {
        accumulateModelUsage(usage, typed as Parameters<typeof accumulateModelUsage>[1]);
      }
    }

    // Persist assistant output.
    const parts = buildAssistantPartsFromEvents(
      events as ReadonlyArray<AnthropicEvent>,
    );
    if (parts.some((part) => part.type !== "step-start")) {
      const contentText = getAssistantTextFromParts(parts);
      const sourceEventId = pickSourceEventId(
        events as ReadonlyArray<AnthropicEvent>,
        runId,
      );

      await upsertMessage(input.supabase, {
        thread_id: input.threadId,
        role: "assistant",
        content: contentText.length > 0 ? contentText : null,
        parts: parts as unknown as Json,
        source_event_id: sourceEventId,
      });

      await deliverToExternalChannels(
        input.supabase,
        input.threadId,
        input.clientId,
        contentText,
        parts,
        sourceEventId,
      ).catch((deliveryError) => {
        console.error(
          "[persistTurnInBackground] external channel delivery failed:",
          deliveryError,
        );
      });
    }

    // Complete the run.
    const costUsd = computeTurnCost({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      activeSeconds: 0, // We don't block on session.retrieve in background.
      anthropicModelId,
    });

    await completeRun(input.supabase, {
      runId,
      status: "completed",
      model: anthropicModelId,
      tokensIn: usage.inputTokens,
      tokensOut: usage.outputTokens,
      cacheReadTokens: usage.cacheReadInputTokens,
      costUsd,
    });

    // Run evaluators.
    await runEvaluatorsForEvents(
      events as ReadonlyArray<AnthropicEvent>,
      runId,
      input.supabase,
      { conversationInput: input.conversationInput },
    );
  } catch (error) {
    console.error("[persistTurnInBackground] failed:", error);
    if (runId) {
      await completeRun(input.supabase, {
        runId,
        status: "failed",
        model: anthropicModelId,
        tokensIn: 0,
        tokensOut: 0,
      }).catch(() => {});
    }
  }
}
