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
import { completeRun, createRun } from "@/lib/runner/run-lifecycle";
import { getAssistantTextFromParts } from "@/lib/runner/message-utils";
import type { Json } from "@/types/database";

import { accumulateModelUsage, computeTurnCost, emptyUsage } from "./adapter-cost";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import {
  iterateSessionEvents,
  openSessionStream,
} from "./session-reconnect";
import type { ManagedSupabaseClient } from "./types";

import type { AnthropicEvent } from "./event-types";

const MANAGED_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Pick a stable per-turn idempotency key from the accumulated events.
 * Mirrors the logic in `adapter.ts`.
 */
function pickSourceEventId(
  events: ReadonlyArray<unknown>,
  runId: string,
): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i] as { id?: string; type?: string };
    if (
      e.type === "session.status_idle" ||
      e.type === "session.status_terminated"
    ) {
      if (typeof e.id === "string" && e.id.length > 0) return e.id;
    }
  }
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i] as { id?: string };
    if (typeof e.id === "string" && e.id.length > 0) return e.id;
  }
  return `run:${runId}`;
}

export interface PersistTurnInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  sessionId: string;
  conversationInput: string;
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
  const runResult = await createRun(input.supabase, {
    threadId: input.threadId,
    clientId: input.clientId,
    runType: "chat",
  });
  const runId = runResult.created ? runResult.runId : `bg:${crypto.randomUUID()}`;

  try {
    // Open the session stream and iterate one turn's events.
    const handle = await openSessionStream(
      input.anthropic as Anthropic,
      input.sessionId,
    );

    const events: unknown[] = [];
    const usage = emptyUsage();

    for await (const event of iterateSessionEvents(
      input.anthropic as Anthropic,
      input.sessionId,
      handle,
    )) {
      events.push(event);

      // Accumulate token usage from model request end events.
      const typed = event as { type?: string; model_usage?: unknown };
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
      const sourceEventId = pickSourceEventId(events, runId);

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
    });

    await completeRun(input.supabase, {
      runId,
      status: "completed",
      model: MANAGED_AGENT_MODEL,
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
    await completeRun(input.supabase, {
      runId,
      status: "failed",
      model: MANAGED_AGENT_MODEL,
      tokensIn: 0,
      tokensOut: 0,
    }).catch(() => {});
  }
}
