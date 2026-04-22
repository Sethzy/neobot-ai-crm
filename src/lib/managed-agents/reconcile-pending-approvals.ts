/**
 * Reconciles a paused `request_approval` turn from the Anthropic webhook.
 *
 * This is the safety net for the pause itself: if the original web request
 * died before persisting the approval card, the webhook rebuilds that state
 * from session history and leaves the run in `running`.
 *
 * @module lib/managed-agents/reconcile-pending-approvals
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createApprovalEvent } from "@/lib/approvals/queries";
import { upsertMessage } from "@/lib/chat/messages";
import { deliverToExternalChannels } from "@/lib/channels/deliver";
import { getAssistantTextFromParts } from "@/lib/runner/message-utils";
import type { Database, Json } from "@/types/database";

import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import type { AnthropicEvent } from "./event-types";
import { pickSourceEventId } from "./source-event-id";
import { toInternalManagedAgentToolName } from "./tool-name-aliases";

export interface PendingApprovalRunInfo {
  runId: string;
  threadId: string;
  clientId: string;
  sessionId: string;
}

export interface ReconcilePendingApprovalsInput {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
  run: PendingApprovalRunInfo;
}

function extractCurrentTurnEvents(allEvents: AnthropicEvent[]): AnthropicEvent[] {
  let lastUserMessageIndex = -1;
  for (let index = allEvents.length - 1; index >= 0; index -= 1) {
    if (allEvents[index]?.type === "user.message") {
      lastUserMessageIndex = index;
      break;
    }
  }

  return lastUserMessageIndex >= 0
    ? allEvents.slice(lastUserMessageIndex)
    : allEvents;
}

function getRequestApprovalEvents(events: ReadonlyArray<AnthropicEvent>) {
  return events.filter(
    (event): event is Extract<AnthropicEvent, { type: "agent.custom_tool_use" }> =>
      event.type === "agent.custom_tool_use"
      && toInternalManagedAgentToolName(event.name) === "request_approval",
  );
}

export async function reconcilePendingApprovals(
  input: ReconcilePendingApprovalsInput,
): Promise<{ reconciled: boolean; reason: string }> {
  const { anthropic, supabase, run } = input;
  const logPrefix = `[reconcile-pending-approvals:${run.sessionId.slice(-8)}]`;

  const allEvents: AnthropicEvent[] = [];
  const page = await anthropic.beta.sessions.events.list(run.sessionId);

  if (Array.isArray((page as { data?: unknown[] }).data)) {
    allEvents.push(...((page as { data: AnthropicEvent[] }).data));
  } else {
    for await (const event of page as AsyncIterable<unknown>) {
      allEvents.push(event as AnthropicEvent);
    }
  }

  const turnEvents = extractCurrentTurnEvents(allEvents);
  const requestApprovalEvents = getRequestApprovalEvents(turnEvents);

  if (requestApprovalEvents.length === 0) {
    return { reconciled: false, reason: "no request_approval event found" };
  }

  for (const event of requestApprovalEvents) {
    const toolInput =
      event.input && typeof event.input === "object" && !Array.isArray(event.input)
        ? (event.input as Record<string, unknown>)
        : {};

    const persisted = await createApprovalEvent(supabase, {
      clientId: run.clientId,
      threadId: run.threadId,
      runId: run.runId,
      toolName: "request_approval",
      toolInput,
      approvalId: event.id,
      sessionId: run.sessionId,
      toolUseId: event.id,
    });

    if (!persisted.success) {
      throw new Error(
        `Failed to persist approval event ${event.id}: ${persisted.error}`,
      );
    }
  }

  const parts = buildAssistantPartsFromEvents(turnEvents);
  if (!parts.some((part) => part.type !== "step-start")) {
    return { reconciled: false, reason: "no assistant parts to persist" };
  }

  const contentText = getAssistantTextFromParts(parts);
  const sourceEventId = pickSourceEventId(turnEvents, run.runId);

  await upsertMessage(supabase, {
    thread_id: run.threadId,
    role: "assistant",
    content: contentText.length > 0 ? contentText : null,
    parts: parts as unknown as Json,
    source_event_id: sourceEventId,
  });

  await deliverToExternalChannels(
    supabase,
    run.threadId,
    run.clientId,
    contentText,
    parts,
    sourceEventId,
  );

  console.log(
    `${logPrefix} reconciled ${requestApprovalEvents.length} pending approval request(s)`,
  );

  return { reconciled: true, reason: "pending approvals reconciled" };
}
