/**
 * Reusable session runner for Anthropic Managed Agents.
 *
 * `consumeAnthropicSession(options)` is the single event-loop implementation
 * shared by the chat adapter and H5's Trigger.dev listener task. It:
 *   - opens the live SSE stream FIRST (skill §7) via `iterateSessionEvents`
 *   - optionally sends a kickoff `user.message`
 *   - iterates the reconnect helper (skill §1 dedup + terminal gate)
 *   - translates each event via `event-translator`
 *   - dispatches custom tool calls and posts the result back to the session
 *   - persists approval events (chat mode) or auto-denies them (trigger mode)
 *   - handles all terminal-gate variants including `requires_action`
 *     (chat mode returns; trigger mode continues after the deny)
 *   - optionally streams `PersistedPart[]` callbacks for incremental
 *     UIMessageStream / DB persistence
 *
 * Callers plug in their own projection via `SessionRunnerCallbacks`.
 *
 * @module lib/managed-agents/session-runner
 */
import type Anthropic from "@anthropic-ai/sdk";

import { createApprovalEvent } from "@/lib/approvals/queries";

import { dispatchCustomTool } from "./dispatcher";
import { createTranslatorState, translateEvent } from "./event-translator";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import {
  iterateSessionEvents,
  openSessionStream,
} from "./session-reconnect";
import type {
  SessionRunnerOptions,
  SessionRunnerResult,
} from "./types";

import type { AnthropicEvent } from "./__tests__/fixtures/events";

export async function consumeAnthropicSession(
  options: SessionRunnerOptions,
): Promise<SessionRunnerResult> {
  const anthropic = options.anthropic as Anthropic;
  const translatorState = createTranslatorState();
  const collectedEvents: unknown[] = [];
  const approvalEventIds: string[] = [];

  // Stream-first: eagerly open the live SSE stream BEFORE sending the
  // kickoff (skill §7 — "subscribe before you send"). The async-generator
  // approach we used originally deferred the real `events.stream()` call
  // until first iteration, which happened AFTER the kickoff and lost the
  // earliest events on cold sessions.
  const liveHandle = openSessionStream(anthropic, options.sessionId);

  // Kickoff AFTER the live stream is open.
  if (options.kickoffMessage) {
    await anthropic.beta.sessions.events.send(options.sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: options.kickoffMessage }],
        },
      ],
    } as never);
  }

  const iterator = iterateSessionEvents(
    anthropic,
    options.sessionId,
    liveHandle,
  );

  let terminalReason: SessionRunnerResult["reason"] | null = null;

  for await (const event of iterator) {
    collectedEvents.push(event);
    const result = translateEvent(translatorState, event as AnthropicEvent);

    // Raw-event callbacks for projection / UI streaming. Fire BEFORE we act
    // on the translator output so callers see the event in arrival order.
    const eventType = (event as { type: string }).type;
    if (eventType === "span.model_request_start") {
      await options.callbacks?.onSpanModelRequestStart?.(event);
    } else if (eventType === "span.model_request_end") {
      await options.callbacks?.onSpanModelRequestEnd?.(event);
    } else if (eventType === "agent.message") {
      await options.callbacks?.onAgentMessage?.(event);
    } else if (eventType === "session.error") {
      await options.callbacks?.onSessionError?.(event);
    } else if (eventType === "agent.custom_tool_use") {
      await options.callbacks?.onAgentToolUse?.(event);
    }

    // Custom tool dispatch — runs synchronously so the result is available
    // for the next agent step.
    if (result.customToolCall) {
      const dispatchResult = await dispatchCustomTool(
        {
          type: "agent.custom_tool_use",
          id: result.customToolCall.id,
          name: result.customToolCall.name,
          input: result.customToolCall.input,
        },
        options.context,
      );
      await anthropic.beta.sessions.events.send(options.sessionId, {
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: dispatchResult.custom_tool_use_id,
            content: dispatchResult.content,
            ...(dispatchResult.is_error ? { is_error: true } : {}),
          },
        ],
      } as never);
      // Synthesize a minimal tool-result event for the callback so chat
      // adapters can write a tool-result UI part.
      await options.callbacks?.onAgentToolResult?.({
        type: "user.custom_tool_result",
        custom_tool_use_id: dispatchResult.custom_tool_use_id,
        content: dispatchResult.content,
      });
    }

    // Approval handling — chat mode persists; trigger mode auto-denies.
    if (result.approvalRequest) {
      if (options.autoDenyApprovals) {
        await anthropic.beta.sessions.events.send(options.sessionId, {
          events: [
            {
              type: "user.tool_confirmation",
              tool_use_id: result.approvalRequest.toolUseId,
              result: "deny",
              deny_message:
                options.autoDenyMessage ??
                "Approval-gated tools are not available in trigger runs.",
            },
          ],
        } as never);
      } else {
        const approvalId = result.approvalRequest.toolUseId;
        await createApprovalEvent(options.context.supabase, {
          clientId: options.context.clientId,
          threadId: options.context.threadId ?? "",
          runId: options.runId,
          toolName: result.approvalRequest.toolName,
          toolInput: result.approvalRequest.input as Record<string, unknown>,
          approvalId,
        });
        approvalEventIds.push(approvalId);
        await options.callbacks?.onApprovalRequired?.(event, approvalId);
      }
    }

    // Incremental persistence — fires onPersistMessage with PersistedParts
    // built from this single event. Idempotency relies on source_event_id
    // (the Anthropic event id) which downstream persistence treats as a
    // unique upsert key.
    if (options.persistIncrementally !== false) {
      const newParts = buildAssistantPartsFromEvents([
        event as AnthropicEvent,
      ]);
      const sourceEventId = (event as { id: string }).id;
      for (const part of newParts) {
        await options.callbacks?.onPersistMessage?.(part, sourceEventId);
      }
    }

    // Terminal handling.
    if (result.terminal === "end_turn") {
      terminalReason = "end_turn";
      break;
    }
    if (result.terminal === "retries_exhausted") {
      terminalReason = "retries_exhausted";
      break;
    }
    if (result.terminal === "terminated") {
      terminalReason = "terminated";
      break;
    }
    if (result.terminal === "requires_action") {
      if (options.autoDenyApprovals) {
        // Auto-deny already sent above; keep consuming the stream until the
        // agent resumes and emits end_turn / retries_exhausted / terminated.
        continue;
      }
      terminalReason = "requires_action";
      break;
    }
  }

  // Session runtime cost — skill §6 post-idle status-write race: accept a
  // near-final value rather than blocking on the final flush.
  let activeSeconds = 0;
  try {
    const snapshot = await anthropic.beta.sessions.retrieve(options.sessionId);
    activeSeconds =
      (snapshot as { stats?: { active_seconds?: number } }).stats
        ?.active_seconds ?? 0;
  } catch (error) {
    console.warn("[session-runner] session.retrieve failed for cost", error);
  }

  // `requires_action` is paused-but-healthy: the run is awaiting UI input.
  // We treat it as `complete` so the chat adapter knows to persist the
  // partial assistant message and hand off to the approval-resolution path.
  const status: SessionRunnerResult["status"] =
    terminalReason === "end_turn" || terminalReason === "requires_action"
      ? "complete"
      : "failed";

  const cost = {
    inputTokens: translatorState.usage.inputTokens,
    outputTokens: translatorState.usage.outputTokens,
    runtimeSeconds: activeSeconds,
  };

  return {
    status,
    reason: terminalReason ?? "terminated",
    accumulatedEvents: collectedEvents,
    cost,
    approvalEventIds,
  };
}
