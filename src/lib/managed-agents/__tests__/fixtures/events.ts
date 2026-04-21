/**
 * Test-only event constructors for the H3 unit tests. The structural
 * types live in `src/lib/managed-agents/event-types.ts` so production
 * code never imports from `__tests__/`.
 *
 * @module lib/managed-agents/__tests__/fixtures/events
 */
export type { AnthropicEvent } from "@/lib/managed-agents/event-types";

export function userMessageEvent(id: string, text: string) {
  return {
    id,
    type: "user.message",
    content: [{ type: "text", text }],
  } as const;
}

export function agentMessageTextEvent(id: string, text: string) {
  return {
    id,
    type: "agent.message",
    content: [{ type: "text", text }],
  } as const;
}

export function customToolUseEvent(id: string, name: string, input: unknown) {
  return {
    id,
    type: "agent.custom_tool_use",
    name,
    input,
  } as const;
}

export function customToolResultEvent(
  id: string,
  customToolUseId: string,
  payload: unknown,
  options: { isError?: boolean } = {},
) {
  return {
    id,
    type: "user.custom_tool_result",
    custom_tool_use_id: customToolUseId,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    ...(options.isError ? { is_error: true } : {}),
  } as const;
}

export function bashToolUseEvent(
  id: string,
  command: string,
  evaluatedPermission: "allow" | "ask" | "deny",
) {
  return {
    id,
    type: "agent.tool_use",
    name: "bash",
    input: { command },
    evaluated_permission: evaluatedPermission,
  } as const;
}

/**
 * Built-in tool result event (e.g. bash output). Pairs with
 * `bashToolUseEvent` via `tool_use_id`.
 */
export function builtInToolResultEvent(
  id: string,
  toolUseId: string,
  text: string,
  options: { isError?: boolean } = {},
) {
  return {
    id,
    type: "agent.tool_result",
    tool_use_id: toolUseId,
    content: [{ type: "text", text }],
    ...(options.isError ? { is_error: true } : {}),
  } as const;
}

export function modelRequestStartEvent(id: string) {
  return { id, type: "span.model_request_start" } as const;
}

export function modelRequestEndEvent(
  id: string,
  inputTokens: number,
  outputTokens: number,
) {
  return {
    id,
    type: "span.model_request_end",
    model_usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  } as const;
}

export function statusIdleEvent(
  id: string,
  stopReason: "end_turn" | "requires_action" | "retries_exhausted",
) {
  return {
    id,
    type: "session.status_idle",
    stop_reason: { type: stopReason },
  } as const;
}

export function statusTerminatedEvent(id: string) {
  return { id, type: "session.status_terminated" } as const;
}

export function sessionErrorEvent(id: string, message: string) {
  return {
    id,
    type: "session.error",
    error: { message },
  } as const;
}
