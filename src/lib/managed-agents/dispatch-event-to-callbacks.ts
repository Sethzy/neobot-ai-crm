/**
 * Routes a raw Anthropic session event to the appropriate
 * `SessionRunnerCallbacks` handler.
 *
 * Extracted from the inline dispatch inside `consumeAnthropicSession` so
 * both the session runner and the read-only stream endpoint share one
 * implementation.
 *
 * @module lib/managed-agents/dispatch-event-to-callbacks
 */
import type { SessionRunnerCallbacks } from "./types";

/**
 * Dispatch a single Anthropic event to the matching callback. Safe to
 * call with a partial callbacks object — missing handlers are no-ops.
 */
export async function dispatchEventToCallbacks(
  event: unknown,
  callbacks: SessionRunnerCallbacks,
): Promise<void> {
  const eventType = (event as { type: string }).type;

  if (eventType === "span.model_request_start") {
    await callbacks.onSpanModelRequestStart?.(event);
  } else if (eventType === "span.model_request_end") {
    await callbacks.onSpanModelRequestEnd?.(event);
  } else if (eventType === "agent.message") {
    await callbacks.onAgentMessage?.(event);
  } else if (eventType === "session.error") {
    await callbacks.onSessionError?.(event);
  } else if (eventType === "agent.custom_tool_use") {
    await callbacks.onAgentToolUse?.(event);
  }
}
