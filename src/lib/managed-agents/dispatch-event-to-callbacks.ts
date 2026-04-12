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
  } else if (eventType === "agent.tool_use" || eventType === "agent.mcp_tool_use") {
    // Built-in or MCP tool with permission_policy "ask" → approval required.
    // The Anthropic event id is the tool_use_id for user.tool_confirmation.
    const typed = event as { id: string; evaluated_permission?: string };
    if (typed.evaluated_permission === "ask") {
      await callbacks.onApprovalRequired?.(event, typed.id);
    }
  } else if (eventType === "user.custom_tool_result" || eventType === "agent.tool_result") {
    // Custom tool results and built-in tool results both stream through
    // as tool-output-available chunks.
    await callbacks.onAgentToolResult?.(event);
  }
}
