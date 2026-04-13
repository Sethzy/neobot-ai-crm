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
    // Built-in or MCP tool uses must still be projected to the UI so the
    // subsequent tool_result can bind to an existing invocation. Approval-
    // gated calls additionally emit onApprovalRequired.
    const typed = event as { id: string; evaluated_permission?: string };
    if (typed.evaluated_permission === "ask") {
      console.info(
        `[dispatch-event-to-callbacks] forwarding approval-gated ${eventType} ${typed.id} to onApprovalRequired`,
      );
      await callbacks.onApprovalRequired?.(event, typed.id);
    } else {
      console.info(
        `[dispatch-event-to-callbacks] forwarding ${eventType} ${typed.id} to onAgentToolUse because evaluated_permission=${typed.evaluated_permission ?? "missing"}`,
      );
      await callbacks.onAgentToolUse?.(event);
    }
  } else if (
    eventType === "user.custom_tool_result" ||
    eventType === "agent.tool_result" ||
    eventType === "agent.mcp_tool_result"
  ) {
    // Custom tool results and built-in tool results both stream through
    // as tool-output-available chunks.
    const toolResultId =
      (event as { custom_tool_use_id?: string; tool_use_id?: string }).custom_tool_use_id
      ?? (event as { custom_tool_use_id?: string; tool_use_id?: string }).tool_use_id
      ?? "missing";
    console.info(
      `[dispatch-event-to-callbacks] forwarding ${eventType} result for tool id ${toolResultId} to onAgentToolResult`,
    );
    await callbacks.onAgentToolResult?.(event);
  }
}
