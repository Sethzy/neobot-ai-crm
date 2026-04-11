/**
 * Shared Anthropic Managed Agents event fixtures for runner + evaluator tests.
 * Shapes mirror claude-api `shared/managed-agents-events.md`.
 *
 * NOTE: This file lives under `__tests__/` because it is test scaffolding,
 * but it is also imported as a TYPE source by production code (translator,
 * evaluator overload). Keep the structural shapes in lockstep with the real
 * Anthropic SSE event payloads.
 *
 * @module lib/managed-agents/__tests__/fixtures/events
 */

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
) {
  return {
    id,
    type: "user.custom_tool_result",
    custom_tool_use_id: customToolUseId,
    content: [{ type: "text", text: JSON.stringify(payload) }],
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

/** Minimal structural union consumed by the translator / runner / evaluators. */
export type AnthropicEvent =
  | ReturnType<typeof userMessageEvent>
  | ReturnType<typeof agentMessageTextEvent>
  | ReturnType<typeof customToolUseEvent>
  | ReturnType<typeof customToolResultEvent>
  | ReturnType<typeof bashToolUseEvent>
  | ReturnType<typeof modelRequestStartEvent>
  | ReturnType<typeof modelRequestEndEvent>
  | ReturnType<typeof statusIdleEvent>
  | ReturnType<typeof statusTerminatedEvent>
  | ReturnType<typeof sessionErrorEvent>;
