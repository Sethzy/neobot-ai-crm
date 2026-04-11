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
import {
  iterateSessionEvents,
  openSessionStream,
} from "./session-reconnect";
import type {
  SessionRunnerOptions,
  SessionRunnerResult,
} from "./types";

import type { AnthropicEvent } from "./event-types";

function shouldEmitIncrementalSnapshot(eventType: AnthropicEvent["type"]): boolean {
  return (
    eventType === "span.model_request_start" ||
    eventType === "agent.message" ||
    eventType === "agent.custom_tool_use" ||
    eventType === "user.custom_tool_result" ||
    eventType === "agent.tool_use" ||
    eventType === "agent.tool_result" ||
    eventType === "session.error"
  );
}

export async function consumeAnthropicSession(
  options: SessionRunnerOptions,
): Promise<SessionRunnerResult> {
  const anthropic = options.anthropic as Anthropic;
  const translatorState = createTranslatorState();
  const collectedEvents: unknown[] = [];
  const approvalEventIds: string[] = [];

  // Stream-first: open and establish the live SSE stream BEFORE sending
  // the kickoff (skill §7 — "subscribe before you send"). Awaiting
  // `openSessionStream` waits for the SSE response headers so the stream
  // is genuinely live before we post the user message. `events.stream()`
  // returns an `APIPromise<Stream<...>>` in the SDK — see the long note
  // in `session-reconnect.ts` for why this await is load-bearing.
  const liveHandle = await openSessionStream(anthropic, options.sessionId);

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

  // Resume-after-approval kickoff. Used when re-entering an existing session
  // that paused on `requires_action`. The user's approve/deny decision is
  // delivered as a `user.tool_confirmation` so the agent can continue from
  // the exact tool-use id it was waiting on.
  if (options.kickoffApproval) {
    await anthropic.beta.sessions.events.send(options.sessionId, {
      events: [
        options.kickoffApproval.result === "allow"
          ? {
              type: "user.tool_confirmation",
              tool_use_id: options.kickoffApproval.toolUseId,
              result: "allow",
            }
          : {
              type: "user.tool_confirmation",
              tool_use_id: options.kickoffApproval.toolUseId,
              result: "deny",
              deny_message:
                options.kickoffApproval.denyMessage ??
                "User denied this action.",
        },
      ],
    } as never);
    await options.onKickoffApprovalSent?.();
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
    const eventType = (event as { type: AnthropicEvent["type"] }).type;
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
        // D6: persist session_id + tool_use_id so H4's
        // /api/tool-confirm route + Telegram callback handler can post
        // user.tool_confirmation back to the originating Anthropic
        // session by exact tool_use_id.
        const persistedApproval = await createApprovalEvent(options.context.supabase, {
          clientId: options.context.clientId,
          threadId: options.context.threadId ?? "",
          runId: options.runId,
          toolName: result.approvalRequest.toolName,
          toolInput: result.approvalRequest.input as Record<string, unknown>,
          approvalId,
          sessionId: options.sessionId,
          toolUseId: result.approvalRequest.toolUseId,
        });
        if (!persistedApproval.success) {
          throw new Error(
            `Failed to persist approval event ${approvalId}: ${persistedApproval.error}`,
          );
        }
        approvalEventIds.push(approvalId);
        await options.callbacks?.onApprovalRequired?.(event, approvalId);
      }
    }

    if (
      options.persistIncrementally &&
      shouldEmitIncrementalSnapshot(eventType)
    ) {
      try {
        await options.callbacks?.onAccumulatedEventsUpdated?.([
          ...collectedEvents,
        ]);
      } catch (error) {
        console.error(
          "[session-runner] incremental snapshot callback failed:",
          error,
        );
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
    cacheReadInputTokens: translatorState.usage.cacheReadInputTokens,
    cacheCreationInputTokens: translatorState.usage.cacheCreationInputTokens,
    runtimeSeconds: activeSeconds,
  };

  await options.onTerminal?.(collectedEvents, cost);

  return {
    status,
    reason: terminalReason ?? "terminated",
    accumulatedEvents: collectedEvents,
    cost,
    approvalEventIds,
  };
}
