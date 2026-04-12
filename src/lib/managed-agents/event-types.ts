/**
 * Structural types for Anthropic Managed Agents SSE events.
 *
 * These shapes mirror the events documented in
 * `roadmap docs/claude-api/shared/managed-agents-events.md` (skill §0).
 * They are intentionally minimal — only the fields the session runner,
 * translator, evaluators, and adapter actually read are typed. Anything
 * else is allowed to pass through as a structural superset because the
 * Anthropic SDK's per-event union changes faster than this code does.
 *
 * Production code imports types from here. Tests import the matching
 * constructors from `__tests__/fixtures/events.ts`, which re-exports
 * `AnthropicEvent` from this module so existing tests don't have to
 * change.
 *
 * @module lib/managed-agents/event-types
 */

export interface UserMessageEvent {
  readonly id: string;
  readonly type: "user.message";
  readonly content: ReadonlyArray<{ type: "text"; text: string }>;
}

export interface AgentMessageTextEvent {
  readonly id: string;
  readonly type: "agent.message";
  readonly content: ReadonlyArray<{ type: "text"; text: string }>;
}

export interface CustomToolUseRawEvent {
  readonly id: string;
  readonly type: "agent.custom_tool_use";
  readonly name: string;
  readonly input: unknown;
}

export interface CustomToolResultRawEvent {
  readonly id: string;
  readonly type: "user.custom_tool_result";
  readonly custom_tool_use_id: string;
  readonly content: ReadonlyArray<{ type: "text"; text: string }>;
}

export interface BashToolUseEvent {
  readonly id: string;
  readonly type: "agent.tool_use";
  readonly name: string;
  readonly input: { command?: string } & Record<string, unknown>;
  readonly evaluated_permission: "allow" | "ask" | "deny";
}

export interface BuiltInToolResultEvent {
  readonly id: string;
  readonly type: "agent.tool_result";
  readonly tool_use_id: string;
  readonly content?: ReadonlyArray<{ type: "text"; text: string }>;
  readonly is_error?: boolean;
}

export interface AgentThreadContextCompactedEvent {
  readonly id: string;
  readonly type: "agent.thread_context_compacted";
}

export interface ModelRequestStartEvent {
  readonly id: string;
  readonly type: "span.model_request_start";
}

export interface ModelRequestEndEvent {
  readonly id: string;
  readonly type: "span.model_request_end";
  readonly model_usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number;
    readonly cache_creation_input_tokens?: number;
  };
}

export interface StatusIdleEvent {
  readonly id: string;
  readonly type: "session.status_idle";
  readonly stop_reason: {
    readonly type: "end_turn" | "requires_action" | "retries_exhausted";
  };
}

export interface StatusTerminatedEvent {
  readonly id: string;
  readonly type: "session.status_terminated";
}

export interface StatusRescheduledEvent {
  readonly id: string;
  readonly type: "session.status_rescheduled";
}

export interface SessionErrorEvent {
  readonly id: string;
  readonly type: "session.error";
  readonly error?: { readonly message?: string };
}

/** Union of every Anthropic event type the H3 surface inspects. */
export type AnthropicEvent =
  | UserMessageEvent
  | AgentMessageTextEvent
  | CustomToolUseRawEvent
  | CustomToolResultRawEvent
  | BashToolUseEvent
  | BuiltInToolResultEvent
  | AgentThreadContextCompactedEvent
  | ModelRequestStartEvent
  | ModelRequestEndEvent
  | StatusIdleEvent
  | StatusRescheduledEvent
  | StatusTerminatedEvent
  | SessionErrorEvent;
