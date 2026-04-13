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
import type Anthropic from "@anthropic-ai/sdk";
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

/** Trigger runs use Sonnet by default. Per-trigger model selection is future work. */
const TRIGGER_DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Poll until the session's server-side status settles to a non-running state.
 *
 * The SSE `session.status_idle` event can arrive slightly before
 * `sessions.retrieve` reports the same, so an immediate `archive()` after
 * the stream exits can 400 with "cannot archive while running". This helper
 * absorbs that race with a short poll (per cookbook `wait_for_idle_status`).
 */
async function waitForSettledStatus(
  anthropic: Anthropic,
  sessionId: string,
  maxWaitMs = 5000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const session = await anthropic.beta.sessions.retrieve(sessionId);
      if (session.status !== "running") return;
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

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
  sessionId: string;
  events: unknown[];
  cost: FinalizedRunCost;
  /** Anthropic client for session archival. */
  anthropic: Anthropic;
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
 * Trigger runs persist to a single assistant row keyed by the run id so
 * in-flight snapshots and terminal finalization keep rewriting the same
 * message instead of appending duplicates.
 */
function pickSourceEventId(runId: string): string {
  return `run:${runId}`;
}

function buildAssistantSnapshot(
  events: ReadonlyArray<AnthropicEvent>,
): { contentText: string; parts: ReturnType<typeof buildAssistantPartsFromEvents> } | null {
  const parts = buildAssistantPartsFromEvents(events);
  const hasContent = parts.some((part) => part.type !== "step-start");
  if (!hasContent) {
    return null;
  }

  return {
    contentText: getAssistantTextFromParts(parts),
    parts,
  };
}

export async function persistTriggerRunSnapshot(
  supabase: SupabaseClient<Database>,
  input: {
    runId: string;
    threadId: string;
    events: ReadonlyArray<unknown>;
  },
): Promise<void> {
  const typedEvents = input.events as AnthropicEvent[];
  const snapshot = buildAssistantSnapshot(typedEvents);
  if (!snapshot) {
    return;
  }

  await upsertMessage(supabase, {
    thread_id: input.threadId,
    role: "assistant",
    content: snapshot.contentText.length > 0 ? snapshot.contentText : null,
    parts: snapshot.parts as unknown as Json,
    source_event_id: pickSourceEventId(input.runId),
  });
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
  // `source_event_id`, so reruns / retries dedupe on the stable run id while
  // incremental snapshots keep updating the same row.
  const snapshot = buildAssistantSnapshot(typedEvents);
  if (snapshot) {
    const sourceEventId = pickSourceEventId(input.runId);
    try {
      await persistTriggerRunSnapshot(supabase, input);
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
        snapshot.contentText,
        snapshot.parts,
        sourceEventId,
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
    model: TRIGGER_DEFAULT_MODEL,
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

  await runEvaluatorsForEvents(typedEvents, input.runId, supabase, {
    conversationInput: getConversationInput(typedEvents),
  });

  // Archive the disposable trigger session to free resources. Trigger
  // sessions are not reused across runs, so archival is always safe here.
  try {
    await waitForSettledStatus(input.anthropic, input.sessionId);
    await input.anthropic.beta.sessions.archive(input.sessionId);
  } catch (archiveError) {
    console.error(
      `[finalizeTriggerRun] session archive failed for ${input.sessionId}:`,
      archiveError,
    );
  }
}
