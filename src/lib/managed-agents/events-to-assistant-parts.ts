/**
 * Translates an Anthropic Managed Agents event array into AI SDK
 * `PersistedPart[]`. Used by the session runner for both incremental
 * (`onPersistMessage`) and terminal (`createMessages`) assistant persistence.
 *
 * The function is intentionally pure: no SDK or DB imports, no event-id
 * dedup. The session runner is responsible for not feeding duplicates here.
 *
 * @module lib/managed-agents/events-to-assistant-parts
 */
import type { PersistedPart } from "@/lib/runner/message-utils";
import { splitTextAndSpecParts } from "@/lib/runner/message-utils";

import type { AnthropicEvent } from "./__tests__/fixtures/events";

export function buildAssistantPartsFromEvents(
  events: ReadonlyArray<AnthropicEvent>,
): PersistedPart[] {
  const parts: PersistedPart[] = [];
  let openedStep = false;

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
      parts.push({
        type: `tool-${event.name}`,
        toolCallId: event.id,
        state: "input-available",
        input: event.input,
      });
      continue;
    }

    if (event.type === "user.custom_tool_result") {
      const existing = parts.find(
        (p) =>
          typeof p.toolCallId === "string" &&
          p.toolCallId === event.custom_tool_use_id,
      );
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
  }

  return parts;
}
