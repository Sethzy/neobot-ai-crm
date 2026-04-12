/**
 * Pure translator — converts a single Anthropic event into a set of UI
 * stream parts plus side-channel hooks (customToolCall, approvalRequest,
 * terminal reason).
 *
 * Consumed only by `session-runner.ts`. No SDK imports, no UI imports —
 * this keeps translator tests fast and deterministic.
 *
 * @module lib/managed-agents/event-translator
 */
import {
  accumulateModelUsage,
  emptyUsage,
  type AccumulatedUsage,
} from "./adapter-cost";
import { toInternalManagedAgentToolName } from "./tool-name-aliases";

import type { AnthropicEvent } from "./event-types";

export type UiStreamPart = Record<string, unknown>;

export type TerminalReason =
  | "end_turn"
  | "requires_action"
  | "retries_exhausted"
  | "terminated"
  | "session_error";

export interface TranslatorState {
  usage: AccumulatedUsage;
  seenEventIds: Set<string>;
  approvalToolUseIds: Set<string>;
}

export interface TranslateResult {
  parts: UiStreamPart[];
  terminal: TerminalReason | null;
  approvalRequest?: { toolUseId: string; toolName: string; input: unknown };
  customToolCall?: { id: string; name: string; input: unknown };
}

export function createTranslatorState(): TranslatorState {
  return {
    usage: emptyUsage(),
    seenEventIds: new Set(),
    approvalToolUseIds: new Set(),
  };
}

export function translateEvent(
  state: TranslatorState,
  event: AnthropicEvent,
): TranslateResult {
  switch (event.type) {
    case "span.model_request_start":
      return { parts: [{ type: "step-start" }], terminal: null };

    case "span.model_request_end":
      accumulateModelUsage(state.usage, event);
      return { parts: [], terminal: null };

    case "agent.message": {
      const parts: UiStreamPart[] = [];
      for (const block of event.content) {
        if (block.type === "text" && block.text.length > 0) {
          parts.push({ type: "text-delta", delta: block.text });
        }
      }
      return { parts, terminal: null };
    }

    case "agent.custom_tool_use": {
      const internalToolName = toInternalManagedAgentToolName(event.name);
      return {
        parts: [
          {
            type: "tool-call",
            toolCallId: event.id,
            toolName: internalToolName,
            input: event.input,
          },
        ],
        terminal: null,
        customToolCall: {
          id: event.id,
          name: internalToolName,
          input: event.input,
        },
      };
    }

    case "user.custom_tool_result": {
      let payload: unknown;
      try {
        payload = JSON.parse(event.content[0]?.text ?? "null");
      } catch {
        payload = event.content[0]?.text ?? null;
      }
      return {
        parts: [
          {
            type: "tool-result",
            toolCallId: event.custom_tool_use_id,
            result: payload,
          },
        ],
        terminal: null,
      };
    }

    case "agent.tool_use": {
      if (event.evaluated_permission !== "ask") {
        return { parts: [], terminal: null };
      }
      if (state.approvalToolUseIds.has(event.id)) {
        return { parts: [], terminal: null };
      }
      state.approvalToolUseIds.add(event.id);
      return {
        parts: [
          {
            type: "tool-approval-request",
            toolUseId: event.id,
            toolName: event.name,
            input: event.input,
          },
        ],
        terminal: null,
        approvalRequest: {
          toolUseId: event.id,
          toolName: event.name,
          input: event.input,
        },
      };
    }

    case "session.status_idle": {
      const reason = event.stop_reason.type;
      if (reason === "end_turn") return { parts: [], terminal: "end_turn" };
      if (reason === "retries_exhausted")
        return { parts: [], terminal: "retries_exhausted" };
      if (reason === "requires_action")
        return { parts: [], terminal: "requires_action" };
      return { parts: [], terminal: null };
    }

    case "session.status_terminated":
      return { parts: [], terminal: "terminated" };

    case "session.error":
      return {
        parts: [
          { type: "error", message: event.error?.message ?? "Session error" },
        ],
        terminal: null,
      };

    default:
      return { parts: [], terminal: null };
  }
}
