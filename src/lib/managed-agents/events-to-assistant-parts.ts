/**
 * Translates an Anthropic Managed Agents event array into AI SDK
 * `PersistedPart[]`. Used by the chat adapter for the terminal
 * `upsertMessage` write — the persisted parts power chat reload + the
 * H5 trigger run-detail page.
 *
 * Handles:
 *   - `span.model_request_start` → `step-start`
 *   - `agent.message` text blocks → text parts (with spec-fence splitting)
 *   - `agent.custom_tool_use` + `user.custom_tool_result` → `tool-<name>`
 *     part with state cycling input-available → output-available
 *   - `agent.tool_use` + `agent.tool_result` (built-in tools, e.g. bash)
 *     → `tool-<name>` part with the same state cycle, plus
 *     `state: "approval-requested"` when `evaluated_permission === "ask"`
 *   - `agent.mcp_tool_use` + `agent.mcp_tool_result` (MCP tools)
 *     → same pattern as built-in tools
 *
 * The function is intentionally pure: no SDK or DB imports, no event-id
 * dedup. The caller is responsible for not feeding duplicates.
 *
 * @module lib/managed-agents/events-to-assistant-parts
 */
import type { PersistedPart } from "@/lib/runner/message-utils";
import { splitTextAndSpecParts } from "@/lib/runner/message-utils";

import type { AnthropicEvent } from "./event-types";
import { toInternalManagedAgentToolName } from "./tool-name-aliases";

export function buildAssistantPartsFromEvents(
  events: ReadonlyArray<AnthropicEvent>,
): PersistedPart[] {
  const parts: PersistedPart[] = [];
  let openedStep = false;

  function findToolPartByCallId(toolCallId: string): PersistedPart | undefined {
    return parts.find(
      (p) => typeof p.toolCallId === "string" && p.toolCallId === toolCallId,
    );
  }

  for (const event of events) {
    if (event.type === "span.model_request_start") {
      parts.push({ type: "step-start" });
      openedStep = true;
      continue;
    }

    if (event.type === "agent.message") {
      if (!openedStep) {
        parts.push({ type: "step-start" });
        openedStep = true;
      }
      for (const block of event.content) {
        if (block.type === "text" && block.text.length > 0) {
          parts.push(...splitTextAndSpecParts(block.text));
        }
      }
      continue;
    }

    if (event.type === "agent.custom_tool_use") {
      const internalToolName = toInternalManagedAgentToolName(event.name);
      parts.push({
        type: `tool-${internalToolName}`,
        toolCallId: event.id,
        state: "input-available",
        input: event.input,
      });
      continue;
    }

    if (event.type === "user.custom_tool_result") {
      const existing = findToolPartByCallId(event.custom_tool_use_id);
      if (existing) {
        const rawText = event.content[0]?.text ?? "{}";
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = rawText;
        }
        existing.state = "output-available";
        existing.output = parsed;
      }
      continue;
    }

    if (event.type === "agent.tool_use" || event.type === "agent.mcp_tool_use") {
      // Built-in or MCP tool. Two persistence paths:
      //   - evaluated_permission === "ask" → emit an approval-requested
      //     part so a user reload during the pause shows the prompt.
      //   - "allow" → emit an input-available part that the matching
      //     tool_result will later upgrade to output-available.
      const isApproval = event.evaluated_permission === "ask";
      parts.push({
        type: `tool-${event.name}`,
        toolCallId: event.id,
        state: isApproval ? "approval-requested" : "input-available",
        input: event.input,
        ...(isApproval ? { approval: { id: event.id } } : {}),
      });
      continue;
    }

    if (event.type === "agent.tool_result" || event.type === "agent.mcp_tool_result") {
      const existing = findToolPartByCallId(event.tool_use_id);
      if (existing) {
        const text = event.content?.[0]?.text ?? "";
        const isError = event.is_error ?? false;
        existing.state = isError ? "output-error" : "output-available";
        existing.output = { text, isError };
      }
      continue;
    }
  }

  return parts;
}
