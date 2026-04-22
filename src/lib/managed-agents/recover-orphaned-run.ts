/**
 * Recovers an orphaned run after the Vercel function died mid-session.
 *
 * Called by the Anthropic `session.status_idled` webhook when it detects
 * that a run is still in "running" status after the session has settled.
 * Follows the same persist → complete → evaluate pattern as
 * `finalize-trigger-run.ts`.
 *
 * @module lib/managed-agents/recover-orphaned-run
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverToExternalChannels } from "@/lib/channels/deliver";
import { upsertMessage } from "@/lib/chat/messages";
import { runEvaluatorsForEvents } from "@/lib/eval/run-evaluators";
import { completeRun } from "@/lib/runner/run-lifecycle";
import { getAssistantTextFromParts } from "@/lib/runner/message-utils";
import type { Database, Json } from "@/types/database";

import {
  accumulateModelUsage,
  computeTurnCost,
  emptyUsage,
} from "./adapter-cost";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import { downloadSessionFiles } from "./download-session-files";
import type { AnthropicEvent } from "./event-types";
import { pickSourceEventId } from "./source-event-id";

export interface OrphanedRunInfo {
  runId: string;
  threadId: string;
  clientId: string;
  sessionId: string;
  model: string;
}

export interface RecoverOrphanedRunInput {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
  run: OrphanedRunInfo;
  stopReasonType: string;
}

/** Extract conversation input from user.message events for evaluators. */
function getConversationInput(events: ReadonlyArray<AnthropicEvent>): string {
  return events
    .filter(
      (event): event is Extract<AnthropicEvent, { type: "user.message" }> =>
        event.type === "user.message",
    )
    .flatMap((event) => event.content)
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

/** Derive terminal run status from session events. */
function getTerminalRunStatus(
  events: ReadonlyArray<AnthropicEvent>,
  stopReasonType: string,
): "completed" | "failed" {
  if (stopReasonType === "end_turn") return "completed";

  // Fall back to scanning events for the terminal state
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
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

/** Sum token usage from `span.model_request_end` events. */
function extractUsageFromEvents(events: ReadonlyArray<AnthropicEvent>) {
  const usage = emptyUsage();
  for (const event of events) {
    if (event.type === "span.model_request_end") {
      accumulateModelUsage(
        usage,
        event as { model_usage?: Record<string, number> },
      );
    }
  }
  return usage;
}

/**
 * Extract events belonging to the current turn only.
 *
 * Sessions are reused across turns, so `events.list()` returns the full
 * history. We find the last `user.message` and take everything from there
 * onward — that's the turn whose run is orphaned.
 */
function extractCurrentTurnEvents(
  allEvents: AnthropicEvent[],
): AnthropicEvent[] {
  let lastUserMessageIndex = -1;
  for (let i = allEvents.length - 1; i >= 0; i--) {
    if (allEvents[i].type === "user.message") {
      lastUserMessageIndex = i;
      break;
    }
  }
  return lastUserMessageIndex >= 0
    ? allEvents.slice(lastUserMessageIndex)
    : allEvents;
}

function findLastResolvedRequestApprovalIndex(
  events: ReadonlyArray<AnthropicEvent>,
): number {
  const requestApprovalIds = new Set(
    events.flatMap((event) =>
      event.type === "agent.custom_tool_use" && event.name === "request_approval"
        ? [event.id]
        : []
    ),
  );

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event.type === "user.custom_tool_result"
      && requestApprovalIds.has(event.custom_tool_use_id)
    ) {
      return index;
    }
  }

  return -1;
}

function extractRecoverableEvents(allEvents: AnthropicEvent[]): {
  events: AnthropicEvent[];
  conversationInput: string;
} {
  const lastResolvedApprovalIndex = findLastResolvedRequestApprovalIndex(allEvents);

  if (lastResolvedApprovalIndex >= 0) {
    const decisionEvent = allEvents[lastResolvedApprovalIndex] as Extract<
      AnthropicEvent,
      { type: "user.custom_tool_result" }
    >;
    const postDecisionEvents = allEvents.slice(lastResolvedApprovalIndex + 1);
    let approved = false;

    try {
      const payload = JSON.parse(decisionEvent.content[0]?.text ?? "{}") as {
        approved?: boolean;
      };
      approved = payload.approved === true;
    } catch {
      approved = false;
    }

    return {
      events: postDecisionEvents,
      conversationInput: `[approval-resume ${decisionEvent.custom_tool_use_id}: ${approved ? "allow" : "deny"}]`,
    };
  }

  const currentTurnEvents = extractCurrentTurnEvents(allEvents);
  return {
    events: currentTurnEvents,
    conversationInput: getConversationInput(currentTurnEvents),
  };
}

export async function recoverOrphanedRun(
  input: RecoverOrphanedRunInput,
): Promise<{ recovered: boolean; reason: string }> {
  const { supabase, anthropic, run, stopReasonType } = input;
  const logPrefix = `[recover-orphaned-run:${run.sessionId.slice(-8)}]`;

  // Approval pauses are handled by the approval-resume path, not recovery.
  if (stopReasonType === "requires_action") {
    console.log(
      `${logPrefix} requires_action — skipping (approval pause)`,
    );
    return { recovered: false, reason: "requires_action — approval pause" };
  }

  // 1. Fetch all events from the session
  const allEvents: AnthropicEvent[] = [];
  const page = await anthropic.beta.sessions.events.list(run.sessionId);
  if (Array.isArray((page as { data?: unknown[] }).data)) {
    allEvents.push(
      ...((page as { data: AnthropicEvent[] }).data),
    );
  } else {
    for await (const event of page as AsyncIterable<unknown>) {
      allEvents.push(event as AnthropicEvent);
    }
  }

  console.log(
    `${logPrefix} fetched ${allEvents.length} events`,
  );

  if (allEvents.length === 0) {
    // Still complete the run so it's not stuck in "running"
    try {
      await completeRun(supabase, {
        runId: run.runId,
        status: "failed",
        model: run.model,
        tokensIn: 0,
        tokensOut: 0,
      });
    } catch { /* no-op if already completed */ }
    return { recovered: false, reason: "no events found" };
  }

  // 2. Extract the event slice that belongs to the orphaned work.
  const {
    events: turnEvents,
    conversationInput,
  } = extractRecoverableEvents(allEvents);
  console.log(
    `${logPrefix} ${turnEvents.length} turn events`,
  );

  // 3. Build assistant parts
  const parts = buildAssistantPartsFromEvents(turnEvents);
  const hasContent = parts.some((part) => part.type !== "step-start");

  // 4. Download session files (non-blocking on failure)
  let fileParts: Array<{
    type: "file";
    url: string;
    mediaType: string;
    filename: string;
    storagePath: string;
  }> = [];
  try {
    const files = await downloadSessionFiles({
      supabase,
      clientId: run.clientId,
      sessionId: run.sessionId,
    });
    fileParts = files.map((file) => ({
      type: "file" as const,
      url: file.signedUrl,
      mediaType: file.mediaType,
      filename: file.filename,
      storagePath: file.storagePath,
    }));
  } catch (downloadError) {
    console.error(`${logPrefix} file download failed:`, downloadError);
  }

  const allParts = [...parts, ...fileParts];

  // 5. Persist assistant message (idempotent on source_event_id)
  if (hasContent || fileParts.length > 0) {
    const contentText = getAssistantTextFromParts(allParts);
    const sourceEventId = pickSourceEventId(turnEvents, run.runId);

    await upsertMessage(supabase, {
      thread_id: run.threadId,
      role: "assistant",
      content: contentText.length > 0 ? contentText : null,
      parts: allParts as unknown as Json,
      source_event_id: sourceEventId,
    });

    console.log(
      `${logPrefix} persisted assistant message`,
    );

    // 6. Deliver to external channels
    try {
      await deliverToExternalChannels(
        supabase,
        run.threadId,
        run.clientId,
        contentText,
        allParts,
        sourceEventId,
      );
    } catch (deliveryError) {
      console.error(`${logPrefix} channel delivery failed:`, deliveryError);
    }
  }

  // 7. Compute cost and complete the run
  const usage = extractUsageFromEvents(turnEvents);
  let runtimeSeconds = 0;
  try {
    const session = await anthropic.beta.sessions.retrieve(run.sessionId);
    runtimeSeconds =
      (session as { stats?: { active_seconds?: number } }).stats
        ?.active_seconds ?? 0;
  } catch (retrieveError) {
    console.warn(`${logPrefix} session.retrieve for cost failed:`, retrieveError);
  }

  const status = getTerminalRunStatus(turnEvents, stopReasonType);
  const costUsd = computeTurnCost({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    activeSeconds: runtimeSeconds,
    anthropicModelId: run.model,
  });

  try {
    await completeRun(supabase, {
      runId: run.runId,
      status,
      model: run.model,
      tokensIn: usage.inputTokens,
      tokensOut: usage.outputTokens,
      cacheReadTokens: usage.cacheReadInputTokens,
      costUsd,
    });
    console.log(`${logPrefix} run completed status=${status}`);
  } catch (completeError) {
    // Race with SSE handler — run was already completed. That's fine.
    console.warn(`${logPrefix} completeRun failed (likely already finalized):`, completeError);
  }

  // 8. Run evaluators
  try {
    await runEvaluatorsForEvents(turnEvents, run.runId, supabase, {
      conversationInput,
    });
  } catch (evalError) {
    console.error(`${logPrefix} evaluators failed:`, evalError);
  }

  return { recovered: true, reason: "full recovery completed" };
}
