/**
 * Projects raw Anthropic session events into AI SDK v6 UI message chunks.
 *
 * This keeps the session-event to UI-chunk mapping identical across every
 * caller that renders managed-agent events into a `UIMessageStreamWriter`.
 *
 * @module lib/managed-agents/session-stream-forwarder
 */
import type { UIMessageStreamWriter } from "ai";

import { toInternalManagedAgentToolName } from "./tool-name-aliases";
import type { SessionRunnerCallbacks } from "./types";

export function buildUiStreamCallbacks(
  writer: UIMessageStreamWriter,
): SessionRunnerCallbacks {
  return {
    onSpanModelRequestStart: () => {
      writer.write({ type: "start-step" } as never);
    },
    onAgentMessage: (event) => {
      const typedEvent = event as {
        id: string;
        content: Array<{ type: string; text?: string }>;
      };
      let textStarted = false;

      for (const block of typedEvent.content) {
        if (
          block.type === "text" &&
          typeof block.text === "string" &&
          block.text.length > 0
        ) {
          if (!textStarted) {
            writer.write({ type: "text-start", id: typedEvent.id } as never);
            textStarted = true;
          }
          writer.write({
            type: "text-delta",
            id: typedEvent.id,
            delta: block.text,
          } as never);
        }
      }

      if (textStarted) {
        writer.write({ type: "text-end", id: typedEvent.id } as never);
      }
    },
    onAgentToolUse: (event) => {
      const typedEvent = event as { id: string; name: string; input: unknown };
      writer.write({
        type: "tool-input-available",
        toolCallId: typedEvent.id,
        toolName: toInternalManagedAgentToolName(typedEvent.name),
        input: typedEvent.input,
      } as never);
    },
    onAgentToolResult: (event) => {
      const typedEvent = event as {
        custom_tool_use_id: string;
        content: Array<{ text: string }>;
      };
      let parsed: unknown;
      try {
        parsed = JSON.parse(typedEvent.content[0]?.text ?? "null");
      } catch {
        parsed = typedEvent.content[0]?.text ?? null;
      }
      writer.write({
        type: "tool-output-available",
        toolCallId: typedEvent.custom_tool_use_id,
        output: parsed,
      } as never);
    },
    onApprovalRequired: (event, approvalId) => {
      const typedEvent = event as { id: string; name: string; input: unknown };
      writer.write({
        type: "tool-input-available",
        toolCallId: typedEvent.id,
        toolName: typedEvent.name,
        input: typedEvent.input,
      } as never);
      writer.write({
        type: "tool-approval-request",
        approvalId,
        toolCallId: typedEvent.id,
      } as never);
    },
    onSessionError: (event) => {
      const typedEvent = event as { error?: { message?: string } };
      writer.write({
        type: "error",
        errorText: typedEvent.error?.message ?? "Session error",
      } as never);
    },
  };
}
