/**
 * Terminal-state finalization for trigger-run Managed Agents sessions.
 *
 * The session runner owns live event consumption and tool dispatch. This
 * helper persists the final assistant message (so the conversation shows
 * the agent's output), records the run status + cost totals, delivers to
 * external channels (Telegram etc.), and runs the event-based evaluator
 * pipeline once the session reaches a terminal state.
 *
 * @module lib/managed-agents/finalize-trigger-run
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverToExternalChannels } from "@/lib/channels/deliver";
import { upsertMessage } from "@/lib/chat/messages";
import { runEvaluatorsForEvents } from "@/lib/eval/run-evaluators";
import { completeRun } from "@/lib/runner/run-lifecycle";
import { getAssistantTextFromParts } from "@/lib/runner/message-utils";
import type { Database, Json } from "@/types/database";

import { computeTurnCost } from "./adapter-cost";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import type { AnthropicEvent } from "./event-types";

const MANAGED_AGENT_MODEL = "claude-sonnet-4-6";

export interface FinalizedRunCost {
  inputTokens: number;
  outputTokens: number;
  runtimeSeconds: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface FinalizeTriggerRunInput {
  runId: string;
  threadId: string;
  clientId: string;
  events: unknown[];
  cost: FinalizedRunCost;
}

function getConversationInput(events: ReadonlyArray<AnthropicEvent>): string {
  return events
    .filter((event): event is Extract<AnthropicEvent, { type: "user.message" }> =>
      event.type === "user.message",
    )
    .flatMap((event) => event.content)
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

function getTerminalRunStatus(
  events: ReadonlyArray<AnthropicEvent>,
): "completed" | "failed" {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "session.status_idle") {
      return event.stop_reason.type === "end_turn" ? "completed" : "failed";
    }

    if (
      event.type === "session.status_terminated" ||
      event.type === "session.error"
    ) {
      return "failed";
    }
  }

  return "failed";
}

/**
 * Same per-turn idempotency logic as `adapter.ts`. Prefers the last
 * terminal event id, then the last event id of any kind, then a synthetic
 * `run:<runId>` fallback so the persist write always has a key.
 */
function pickSourceEventId(
  events: ReadonlyArray<AnthropicEvent>,
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

export async function finalizeTriggerRun(
  supabase: SupabaseClient<Database>,
  input: FinalizeTriggerRunInput,
): Promise<void> {
  const typedEvents = input.events as AnthropicEvent[];
  const status = getTerminalRunStatus(typedEvents);

  // Persist the assistant message first so the user can see the output on
  // both the happy path (end_turn) and the failure path (retries_exhausted
  // with partial content is still useful). `upsertMessage` is keyed by
  // `source_event_id`, so reruns / retries dedupe on the terminal event id.
  const parts = buildAssistantPartsFromEvents(typedEvents);
  const hasContent = parts.some((p) => p.type !== "step-start");
  if (hasContent) {
    const contentText = getAssistantTextFromParts(parts);
    const sourceEventId = pickSourceEventId(typedEvents, input.runId);
    try {
      await upsertMessage(supabase, {
        thread_id: input.threadId,
        role: "assistant",
        content: contentText.length > 0 ? contentText : null,
        parts: parts as unknown as Json,
        source_event_id: sourceEventId,
      });
    } catch (persistError) {
      console.error(
        "[finalizeTriggerRun] assistant message persistence failed:",
        persistError,
      );
    }

    // Deliver to external channels (Telegram etc.) so autopilot output
    // reaches the user on the same channel the trigger targets. Failures
    // are logged but do not block run completion.
    try {
      await deliverToExternalChannels(
        supabase,
        input.threadId,
        input.clientId,
        contentText,
        parts,
      );
    } catch (deliveryError) {
      console.error(
        "[finalizeTriggerRun] external channel delivery failed:",
        deliveryError,
      );
    }
  }

  await completeRun(supabase, {
    runId: input.runId,
    status,
    model: MANAGED_AGENT_MODEL,
    tokensIn: input.cost.inputTokens,
    tokensOut: input.cost.outputTokens,
    cacheReadTokens: input.cost.cacheReadInputTokens ?? 0,
    costUsd: computeTurnCost({
      inputTokens: input.cost.inputTokens,
      outputTokens: input.cost.outputTokens,
      cacheReadInputTokens: input.cost.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: input.cost.cacheCreationInputTokens ?? 0,
      activeSeconds: input.cost.runtimeSeconds,
    }),
  });

  if (status !== "completed") {
    return;
  }

  await runEvaluatorsForEvents(typedEvents, input.runId, supabase, {
    conversationInput: getConversationInput(typedEvents),
  });
}
