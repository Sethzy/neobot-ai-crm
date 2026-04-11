/**
 * Shared types for the Managed Agents session runner, adapter, and dispatcher.
 *
 * This module re-exports the canonical tool contracts from `./tools/types`
 * (so the registry and runner share one source of truth) and adds the
 * session runner contracts: callbacks, options, terminal results, and the
 * uniform Anthropic custom-tool envelope used by the dispatcher.
 *
 * @module lib/managed-agents/types
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// ── Re-exports from the canonical tool contracts ────────────────────────────
export type {
  ManagedAgentTool,
  ToolContext,
  ToolResult,
} from "./tools/types";

import type { ToolContext as _ToolContext } from "./tools/types";

/**
 * Tool factory context — user-auth in chat, service-role in triggers.
 *
 * Alias of `ToolContext` so the dispatcher / session runner can talk in
 * "DispatchContext" terms (the runner-side name) without forking the tool
 * registry's runtime context shape.
 */
export type DispatchContext = _ToolContext;

export type ManagedSupabaseClient = SupabaseClient<Database>;

/** Chat/file attachment metadata passed into Managed Agents entry points. */
export interface ManagedFilePart {
  type: "file";
  url: string;
  mediaType: string;
  filename?: string;
  storagePath?: string;
}

// ── Custom tool envelope shapes ─────────────────────────────────────────────

/** Normalized custom tool call event from Anthropic. */
export interface CustomToolUseEvent {
  type: "agent.custom_tool_use";
  id: string;
  name: string;
  input: unknown;
}

/** Anthropic `user.custom_tool_result` content array entry. */
export interface CustomToolResultContent {
  custom_tool_use_id: string;
  content: Array<{ type: "text"; text: string }>;
  is_error?: boolean;
}

// ── Session runner contracts ────────────────────────────────────────────────

/** Per-run cost totals accumulated inside the session runner. */
export interface RunCostTotals {
  /** Total input tokens — includes both cached and uncached portions. */
  inputTokens: number;
  outputTokens: number;
  /** Cache-read input tokens (subset of inputTokens). */
  cacheReadInputTokens: number;
  /** Cache-creation input tokens (subset of inputTokens). */
  cacheCreationInputTokens: number;
  runtimeSeconds: number;
}

/** Terminal outcome returned by `consumeAnthropicSession`. */
export interface SessionRunnerResult {
  status: "complete" | "failed";
  reason:
    | "end_turn"
    | "requires_action"
    | "retries_exhausted"
    | "terminated"
    | "session_error";
  accumulatedEvents: unknown[];
  cost: RunCostTotals;
  /** approval_events.approval_id values inserted during the run. */
  approvalEventIds: string[];
}

/**
 * Callbacks that let callers observe / project events without touching the
 * runner internals. The chat adapter wires them into a UIMessageStream
 * writer; H5's trigger task wires them into a no-op (terminal-only
 * persistence happens in the adapter, not the runner).
 */
export interface SessionRunnerCallbacks {
  onAgentMessage?: (event: unknown) => void | Promise<void>;
  onAgentToolUse?: (event: unknown) => void | Promise<void>;
  onAgentToolResult?: (event: unknown) => void | Promise<void>;
  onApprovalRequired?: (
    event: unknown,
    approvalId: string,
  ) => void | Promise<void>;
  onSpanModelRequestStart?: (event: unknown) => void | Promise<void>;
  onSpanModelRequestEnd?: (event: unknown) => void | Promise<void>;
  onSessionError?: (event: unknown) => void | Promise<void>;
}

/** Options passed to `consumeAnthropicSession`. */
export interface SessionRunnerOptions {
  /** Anthropic SDK client — narrowed inside the runner. */
  anthropic: unknown;
  sessionId: string;
  runId: string;
  context: DispatchContext;
  callbacks?: SessionRunnerCallbacks;
  /**
   * Trigger-listener hint from H5. The current H3 core does not project
   * incremental persistence itself, but the option is part of the shared
   * contract so the listener can opt into that behavior as the persistence
   * callbacks land.
   */
  persistIncrementally?: boolean;
  /**
   * Terminal hook used by the Trigger.dev listener to persist final run
   * status and evaluator scores once the session stops.
   */
  onTerminal?: (
    events: unknown[],
    cost: RunCostTotals,
  ) => void | Promise<void>;
  /** If provided, send as user.message AFTER opening the stream (fresh sessions). */
  kickoffMessage?: string;
  /**
   * If provided, send a `user.tool_confirmation` AFTER opening the stream
   * instead of (or in addition to) a `user.message`. Used by the
   * resume-after-approval path to re-enter an existing session that paused
   * on `requires_action`. Mutually exclusive with `kickoffMessage` in
   * practice, but the runner will send both if both are set.
   */
  kickoffApproval?: {
    toolUseId: string;
    result: "allow" | "deny";
    denyMessage?: string;
  };
  /**
   * Trigger-mode: auto-deny bash approvals via user.tool_confirmation.
   * Defaults to false (chat-mode behaviour).
   */
  autoDenyApprovals?: boolean;
  autoDenyMessage?: string;
}
