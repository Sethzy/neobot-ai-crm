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
import { toInternalManagedAgentToolName } from "./tool-name-aliases";

/**
 * Dispatch a single Anthropic event to the matching callback. Safe to
 * call with a partial callbacks object — missing handlers are no-ops.
 */
export async function dispatchEventToCallbacks(
  event: unknown,
  callbacks: SessionRunnerCallbacks,
): Promise<void> {
  const eventType = (event as { type: string }).type;
  const tStart = performance.now();
  let handler = "none";

  if (eventType === "span.model_request_start") {
    handler = "onSpanModelRequestStart";
    await callbacks.onSpanModelRequestStart?.(event);
  } else if (eventType === "span.model_request_end") {
    handler = "onSpanModelRequestEnd";
    await callbacks.onSpanModelRequestEnd?.(event);
  } else if (eventType === "agent.message") {
    handler = "onAgentMessage";
    await callbacks.onAgentMessage?.(event);
  } else if (eventType === "session.error") {
    handler = "onSessionError";
    await callbacks.onSessionError?.(event);
  } else if (eventType === "agent.custom_tool_use") {
    const typed = event as { name?: string };
    if (toInternalManagedAgentToolName(typed.name ?? "") === "request_approval") {
      handler = "deferred-approval";
    } else {
      handler = "onAgentToolUse";
      await callbacks.onAgentToolUse?.(event);
    }
  } else if (eventType === "agent.tool_use" || eventType === "agent.mcp_tool_use") {
    // Built-in or MCP tool uses must still be projected to the UI so the
    // subsequent tool_result can bind to an existing invocation. Approval-
    // gated calls additionally emit onApprovalRequired.
    const typed = event as { id: string; evaluated_permission?: string };
    if (typed.evaluated_permission === "ask") {
      handler = "onApprovalRequired";
      console.info(
        `[dispatch-event-to-callbacks] forwarding approval-gated ${eventType} ${typed.id} to onApprovalRequired`,
      );
      await callbacks.onApprovalRequired?.(event, typed.id);
    } else {
      handler = "onAgentToolUse";
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
    handler = "onAgentToolResult";
    const toolResultId =
      (event as { custom_tool_use_id?: string; tool_use_id?: string }).custom_tool_use_id
      ?? (event as { custom_tool_use_id?: string; tool_use_id?: string }).tool_use_id
      ?? "missing";
    console.info(
      `[dispatch-event-to-callbacks] forwarding ${eventType} result for tool id ${toolResultId} to onAgentToolResult`,
    );
    await callbacks.onAgentToolResult?.(event);
  }

  const elapsed = Math.round(performance.now() - tStart);
  if (elapsed > 2) {
    console.info(`[dispatch-event-to-callbacks] ${eventType} → ${handler} took ${elapsed}ms`);
  }
}
