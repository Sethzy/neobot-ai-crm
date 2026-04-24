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

import { CHAT_ANTHROPIC_REQUEST_OPTIONS } from "./chat-request-options";
import { dispatchEventToCallbacks } from "./dispatch-event-to-callbacks";
import { dispatchCustomTool } from "./dispatcher";
import { createTranslatorState, translateEvent } from "./event-translator";
import {
  iterateSessionEventsAfter,
  openSessionTail,
} from "./session-reconnect";
import type {
  SessionRunnerCallbacks,
  DeferredCustomToolDispatchResult,
  SessionRunnerOptions,
  SessionRunnerResult,
} from "./types";

import type { AnthropicEvent } from "./event-types";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

function serializeForLog(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return "null";
    }

    return serialized.length > 600
      ? `${serialized.slice(0, 597)}...`
      : serialized;
  } catch {
    return "[unserializable]";
  }
}

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

async function persistDeferredApproval(options: {
  approval: DeferredCustomToolDispatchResult;
  sessionId: string;
  runId: string;
  context: SessionRunnerOptions["context"];
  onApprovalRequired?: SessionRunnerCallbacks["onApprovalRequired"];
}): Promise<string> {
  const approvalId = options.approval.toolUseId;
  const toolInput =
    options.approval.toolInput &&
      typeof options.approval.toolInput === "object" &&
      !Array.isArray(options.approval.toolInput)
      ? (options.approval.toolInput as Record<string, unknown>)
      : {};

  const persistedApproval = await createApprovalEvent(options.context.supabase, {
    clientId: options.context.clientId,
    threadId: options.context.threadId ?? "",
    runId: options.runId,
    toolName: options.approval.toolName,
    toolInput,
    approvalId,
    sessionId: options.sessionId,
    toolUseId: options.approval.toolUseId,
  });
  if (!persistedApproval.success) {
    throw new Error(
      `Failed to persist approval event ${approvalId}: ${persistedApproval.error}`,
    );
  }

  try {
    await options.onApprovalRequired?.(
      {
        type: "agent.custom_tool_use",
        id: options.approval.toolUseId,
        name: options.approval.toolName,
        input: options.approval.toolInput,
      },
      approvalId,
    );
  } catch (callbackError) {
    console.warn("[session-runner] deferred approval callback failed, continuing", callbackError);
  }

  return approvalId;
}

export async function consumeAnthropicSession(
  options: SessionRunnerOptions,
): Promise<SessionRunnerResult> {
  const anthropic = options.anthropic as Anthropic;
  const translatorState = createTranslatorState();
  translatorState.sessionId = options.sessionId;
  const collectedEvents: unknown[] = [];
  const approvalEventIds: string[] = [];

  // Two modes:
  //   Mode A (default): Open the live SSE stream FIRST and capture the
  //     latest pre-kickoff event cursor, then send the kickoff. Used by
  //     adapter.ts and trigger runs where the runner owns the full
  //     lifecycle.
  //   Mode B (tailHandle): The kickoff was already sent by the caller
  //     before handing control to the runner. The runner accepts a
  //     pre-opened SessionTailHandle and skips stream opening +
  //     kickoff sending.

  let iterator: AsyncGenerator<{ id: string; type: string; stop_reason?: { type: string } }>;

  const logPrefix = `[session-runner:${options.sessionId.slice(-8)}]`;
  const tRunnerStart = performance.now();

  if (options.tailHandle) {
    console.log(`${logPrefix} Mode B (tailHandle) — afterId=${options.tailHandle.afterId}`);
    // Mode B: tail-handle mode — kickoff already sent, just consume.
    // Send kickoff approval if provided (approval resume via send route).
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
      } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
      await options.onKickoffApprovalSent?.();
    }

    if (options.kickoffCustomToolResult) {
      await anthropic.beta.sessions.events.send(options.sessionId, {
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: options.kickoffCustomToolResult.custom_tool_use_id,
            content: options.kickoffCustomToolResult.content,
            ...(options.kickoffCustomToolResult.is_error ? { is_error: true } : {}),
          },
        ],
      } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
      await options.onKickoffCustomToolResultSent?.();
    }

    iterator = iterateSessionEventsAfter(
      anthropic,
      options.sessionId,
      options.tailHandle,
    );
  } else {
    console.log(`${logPrefix} Mode A (stream-first tail)`);
    // Mode A: open the SSE stream and capture the latest pre-kickoff
    // cursor, then send kickoff, then list only events after that
    // cursor. This keeps the subscribe-before-send guarantee while
    // avoiding full session-history snapshots on every turn.
    const tSseOpen = performance.now();
    const liveHandle = await openSessionTail(anthropic, options.sessionId);
    const tSseReady = performance.now();
    console.log(`${logPrefix} SSE stream opened in ${Math.round(tSseReady - tSseOpen)}ms`);

    if (options.kickoffContent) {
      await anthropic.beta.sessions.events.send(options.sessionId, {
        events: [
          {
            type: "user.message",
            content: options.kickoffContent,
          },
        ],
      } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
      console.log(`${logPrefix} kickoff sent in ${Math.round(performance.now() - tSseReady)}ms`);
    }

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
      } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
      await options.onKickoffApprovalSent?.();
    }

    if (options.kickoffCustomToolResult) {
      await anthropic.beta.sessions.events.send(options.sessionId, {
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: options.kickoffCustomToolResult.custom_tool_use_id,
            content: options.kickoffCustomToolResult.content,
            ...(options.kickoffCustomToolResult.is_error ? { is_error: true } : {}),
          },
        ],
      } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
      await options.onKickoffCustomToolResultSent?.();
    }

    const preferLiveOnly = true;
    console.log(`${logPrefix} consuming live stream without history replay`);

    iterator = iterateSessionEventsAfter(
      anthropic,
      options.sessionId,
      liveHandle,
      { preferLiveOnly },
    );
  }

  let terminalReason: SessionRunnerResult["reason"] | null = null;
  /** Custom tool use IDs that have been dispatched and responded to. Used to
   *  distinguish stale `requires_action` (custom tool already handled) from
   *  genuine approval pauses (built-in tool with `always_ask` permission). */
  const dispatchedCustomToolIds = new Set<string>();
  let tFirstEvent: number | null = null;
  let tLastEvent = performance.now();

  let tFirstTextDelta: number | null = null;
  let eventIndex = 0;

  for await (const event of iterator) {
    const tEventReceived = performance.now();
    if (!tFirstEvent) {
      tFirstEvent = tEventReceived;
      console.log(`${logPrefix} time-to-first-event: ${Math.round(tFirstEvent - tRunnerStart)}ms`);
    }
    const tSinceLastEvent = Math.round(tEventReceived - tLastEvent);
    tLastEvent = tEventReceived;
    collectedEvents.push(event);

    const tTranslateStart = performance.now();
    const result = translateEvent(translatorState, event as AnthropicEvent);
    const tTranslateEnd = performance.now();

    const eventType = (event as { type: AnthropicEvent["type"] }).type;
    const inputSuffix =
      eventType === "agent.custom_tool_use"
        ? ` input=${serializeForLog((event as { input?: unknown }).input)}`
        : eventType === "agent.tool_use" || eventType === "agent.mcp_tool_use"
          ? ` input=${serializeForLog((event as { input?: unknown }).input)}`
          : "";
    const toolResultSuffix =
      eventType === "user.custom_tool_result"
        ? ` custom_tool_use_id=${(event as { custom_tool_use_id?: string }).custom_tool_use_id ?? "missing"}`
        : eventType === "agent.tool_result" || eventType === "agent.mcp_tool_result"
          ? ` tool_use_id=${(event as { tool_use_id?: string }).tool_use_id ?? "missing"} is_error=${(event as { is_error?: boolean }).is_error ?? false}`
          : "";
    // Surface the only user-facing signal Managed Agents publishes for automatic
    // prompt caching: `span.model_request_end` carries `model_usage.cache_read_input_tokens`
    // and `cache_creation_input_tokens`. cache_read>0 on warm turns confirms the
    // built-in session cache is firing; cache_read=0 means it isn't.
    const cacheSuffix =
      eventType === "span.model_request_end"
        ? (() => {
            const usage = (event as { model_usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            } }).model_usage;
            if (!usage) return " model_usage=missing";
            return ` model_usage=in:${usage.input_tokens ?? 0} out:${usage.output_tokens ?? 0} cache_read:${usage.cache_read_input_tokens ?? 0} cache_write:${usage.cache_creation_input_tokens ?? 0}`;
          })()
        : "";
    const translateMs = Math.round(tTranslateEnd - tTranslateStart);
    console.log(`${logPrefix} event[${eventIndex}]: ${eventType} id=${(event as { id: string }).id.slice(-8)} gap=${tSinceLastEvent}ms translate=${translateMs}ms${result.terminal ? ` terminal=${result.terminal}` : ""}${result.customToolCall ? ` tool=${result.customToolCall.name}` : ""}${result.approvalRequest ? ` approval=${result.approvalRequest.toolName}` : ""}${inputSuffix}${toolResultSuffix}${cacheSuffix}`);

    // Track first text-delta — the moment the user sees a reply.
    if (!tFirstTextDelta && eventType === "agent.message") {
      const hasText = (event as { content?: Array<{ type: string; text?: string }> }).content?.some(
        (block) => block.type === "text" && typeof block.text === "string" && block.text.length > 0,
      );
      if (hasText) {
        tFirstTextDelta = tEventReceived;
        console.log(`${logPrefix} ⏱ time-to-first-text: ${Math.round(tFirstTextDelta - tRunnerStart)}ms (from runner start)`);
      }
    }

    // Raw-event callbacks for projection / UI streaming. Fire BEFORE we act
    // on the translator output so callers see the event in arrival order.
    // Wrapped in try-catch so a dead UI stream (client navigated away) does
    // not kill the session runner — tool dispatch and finalization must
    // continue regardless of whether the browser is still listening.
    if (options.callbacks) {
      try {
        const tCallbackStart = performance.now();
        await dispatchEventToCallbacks(event, options.callbacks);
        const tCallbackEnd = performance.now();
        const callbackMs = Math.round(tCallbackEnd - tCallbackStart);
        if (callbackMs > 5) {
          console.log(`${logPrefix} callback dispatch slow: ${callbackMs}ms for ${eventType}`);
        }
      } catch (callbackError) {
        console.warn(`${logPrefix} callback failed (client likely disconnected), continuing session`, callbackError);
      }
    }

    eventIndex++;

    // Custom tool dispatch — runs synchronously so the result is available
    // for the next agent step. Wrapped in try-catch so a tool crash or
    // network failure posts an error result back to Anthropic instead of
    // silently deadlocking the session in requires_action.
    if (result.customToolCall) {
      try {
        const tToolStart = performance.now();
        const dispatchResult = await dispatchCustomTool(
          {
            type: "agent.custom_tool_use",
            id: result.customToolCall.id,
            name: result.customToolCall.name,
            input: result.customToolCall.input,
          },
          options.context,
        );
        const tToolDispatched = performance.now();
        if (dispatchResult.kind === "deferred") {
          const approvalId = await persistDeferredApproval({
            approval: dispatchResult,
            sessionId: options.sessionId,
            runId: options.runId,
            context: options.context,
            onApprovalRequired: options.callbacks?.onApprovalRequired,
          });
          approvalEventIds.push(approvalId);
          console.log(
            `${logPrefix} deferred custom tool ${result.customToolCall.name} (${result.customToolCall.id.slice(-8)}) exec=${Math.round(tToolDispatched - tToolStart)}ms approval=${approvalId.slice(-8)}`,
          );
        } else {
          await anthropic.beta.sessions.events.send(options.sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: dispatchResult.custom_tool_use_id,
                content: dispatchResult.content,
                ...(dispatchResult.is_error ? { is_error: true } : {}),
              },
            ],
          } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
          const tToolSent = performance.now();
          dispatchedCustomToolIds.add(result.customToolCall.id);
          console.log(`${logPrefix} dispatched custom tool ${result.customToolCall.name} (${result.customToolCall.id.slice(-8)}) is_error=${dispatchResult.is_error ?? false} exec=${Math.round(tToolDispatched - tToolStart)}ms send=${Math.round(tToolSent - tToolDispatched)}ms`);
          // Synthesize a minimal tool-result event for the callback so chat
          // adapters can write a tool-result UI part. Non-fatal — same rationale
          // as the pre-dispatch callback above.
          try {
            await options.callbacks?.onAgentToolResult?.({
              type: "user.custom_tool_result",
              custom_tool_use_id: dispatchResult.custom_tool_use_id,
              content: dispatchResult.content,
              ...(dispatchResult.is_error ? { is_error: true } : {}),
            });
          } catch (callbackError) {
            console.warn(`${logPrefix} post-dispatch callback failed, continuing`, callbackError);
          }
        }
      } catch (toolError) {
        console.error(`${logPrefix} tool dispatch failed for ${result.customToolCall.name} (${result.customToolCall.id.slice(-8)}):`, toolError);
        // Post an error result to Anthropic so the session stays alive.
        try {
          await anthropic.beta.sessions.events.send(options.sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: result.customToolCall.id,
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: toolError instanceof Error ? toolError.message : "Tool execution failed",
                    }),
                  },
                ],
                is_error: true,
              },
            ],
          } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
          dispatchedCustomToolIds.add(result.customToolCall.id);
        } catch (sendError) {
          // Double failure — can't recover. Let the session runner crash.
          console.error(`${logPrefix} failed to post error result for ${result.customToolCall.name}, session will deadlock:`, sendError);
          throw sendError;
        }
      }
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
        } as never, CHAT_ANTHROPIC_REQUEST_OPTIONS);
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
        try {
          await options.callbacks?.onApprovalRequired?.(event, approvalId);
        } catch (callbackError) {
          console.warn(`${logPrefix} approval callback failed, continuing`, callbackError);
        }
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

      // Check if this requires_action is stale — i.e. all referenced
      // event_ids are custom tool calls that were already dispatched and
      // responded to above. If so, the session is already resuming and
      // we should keep consuming events instead of breaking.
      const idleEvent = event as { stop_reason?: { event_ids?: string[] } };
      const pendingIds = idleEvent.stop_reason?.event_ids ?? [];
      const allHandled = pendingIds.length > 0 &&
        pendingIds.every((id) => dispatchedCustomToolIds.has(id));
      console.log(`${logPrefix} requires_action: pendingIds=[${pendingIds.map(id => id.slice(-8)).join(",")}] dispatched=[${[...dispatchedCustomToolIds].map(id => id.slice(-8)).join(",")}] allHandled=${allHandled}`);
      if (allHandled) {
        console.log(`${logPrefix} stale requires_action — custom tools already dispatched, continuing`);
        continue;
      }

      console.log(`${logPrefix} genuine requires_action — breaking for approval`);
      terminalReason = "requires_action";
      break;
    }
  }

  const tLoopEnd = performance.now();
  // cumulative cache_read / cache_creation totals at the turn boundary.
  // cache_read > 0 across consecutive warm turns within a 5-min window
  // confirms the docs-promised automatic prompt caching is firing.
  console.log(`${logPrefix} loop exited — terminalReason=${terminalReason} events=${collectedEvents.length} dispatchedTools=${dispatchedCustomToolIds.size} loopTime=${Math.round(tLoopEnd - tRunnerStart)}ms firstText=${tFirstTextDelta ? Math.round(tFirstTextDelta - tRunnerStart) + "ms" : "none"} usage=in:${translatorState.usage.inputTokens} out:${translatorState.usage.outputTokens} cache_read:${translatorState.usage.cacheReadInputTokens} cache_write:${translatorState.usage.cacheCreationInputTokens}`);

  // `requires_action` is paused-but-healthy: the run is awaiting UI input.
  // We treat it as `complete` so the chat adapter knows to persist the
  // partial assistant message and hand off to the approval-resolution path.
  const status: SessionRunnerResult["status"] =
    terminalReason === "end_turn" || terminalReason === "requires_action"
      ? "complete"
      : "failed";

  // Session runtime cost — fetch active_seconds without blocking the
  // response. The onTerminal callback and cost object use 0 as a fallback;
  // the retrieve runs concurrently with finalization downstream.
  const cost = {
    inputTokens: translatorState.usage.inputTokens,
    outputTokens: translatorState.usage.outputTokens,
    cacheReadInputTokens: translatorState.usage.cacheReadInputTokens,
    cacheCreationInputTokens: translatorState.usage.cacheCreationInputTokens,
    runtimeSeconds: 0,
  };

  // Fire-and-forget: populate runtimeSeconds asynchronously so it's
  // available by the time finalizeRun reads cost, but don't block the
  // stream close on the ~500ms retrieve round-trip.
  const retrievePromise = (async () => {
    try {
      const tRetrieveStart = performance.now();
      const snapshot = await anthropic.beta.sessions.retrieve(
        options.sessionId,
        {},
        CHAT_ANTHROPIC_REQUEST_OPTIONS,
      );
      cost.runtimeSeconds =
        (snapshot as { stats?: { active_seconds?: number } }).stats
          ?.active_seconds ?? 0;
      console.log(`${logPrefix} session.retrieve for cost: ${Math.round(performance.now() - tRetrieveStart)}ms`);
    } catch (error) {
      console.warn("[session-runner] session.retrieve failed for cost", error);
    }
  })();

  await options.onTerminal?.(collectedEvents, cost);

  return {
    status,
    reason: terminalReason ?? "terminated",
    accumulatedEvents: collectedEvents,
    cost,
    approvalEventIds,
    costRetrievePromise: retrievePromise,
  };
}
