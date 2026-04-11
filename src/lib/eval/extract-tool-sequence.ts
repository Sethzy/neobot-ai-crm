/**
 * Extracts an ordered sequence of tool call records from Anthropic Managed
 * Agents events.
 *
 * @module lib/eval/extract-tool-sequence
 */
import type { AnthropicEvent } from "@/lib/managed-agents/event-types";

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
  startTime: string;
  observationId: string;
}

/**
 * Extract a time-ordered tool call sequence from Anthropic Managed Agents
 * events. Pairs:
 *   - `agent.custom_tool_use` with `user.custom_tool_result` (custom tools
 *     dispatched via the runner's MANAGED_AGENT_TOOLS registry)
 *   - `agent.tool_use` with `agent.tool_result` (built-in tools like bash
 *     that execute server-side at Anthropic)
 *
 * Built-in tools are visible to evaluators because the safety gate cares
 * about bash execution and the legacy trace-driven path saw them too.
 *
 * Order is preserved by insertion (Anthropic emits events in chronological
 * order).
 */
export function extractToolSequenceFromEvents(
  events: ReadonlyArray<AnthropicEvent>,
): ToolCallRecord[] {
  const indexById = new Map<string, number>();
  const records: ToolCallRecord[] = [];

  for (const event of events) {
    if (event.type === "agent.custom_tool_use") {
      indexById.set(event.id, records.length);
      records.push({
        toolName: event.name,
        input: event.input,
        output: undefined,
        startTime: "",
        observationId: event.id,
      });
      continue;
    }
    if (event.type === "agent.tool_use") {
      // Built-in tools (bash, etc.) — keyed by event id which the
      // matching tool_result references via tool_use_id.
      indexById.set(event.id, records.length);
      records.push({
        toolName: event.name,
        input: event.input,
        output: undefined,
        startTime: "",
        observationId: event.id,
      });
      continue;
    }
    if (event.type === "user.custom_tool_result") {
      const idx = indexById.get(event.custom_tool_use_id);
      if (idx == null) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.content[0]?.text ?? "null");
      } catch {
        parsed = event.content[0]?.text;
      }
      records[idx] = { ...records[idx], output: parsed };
      continue;
    }
    if (event.type === "agent.tool_result") {
      const idx = indexById.get(event.tool_use_id);
      if (idx == null) continue;
      records[idx] = {
        ...records[idx],
        output: {
          text: event.content?.[0]?.text ?? "",
          isError: event.is_error ?? false,
        },
      };
    }
  }

  return records;
}
