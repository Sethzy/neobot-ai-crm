/**
 * Extracts an ordered sequence of tool call records from either Langfuse
 * observations (legacy path) or Anthropic Managed Agents events (H3 path).
 *
 * Both paths emit the same `ToolCallRecord[]` shape so the safety-gate and
 * CRM-hallucination evaluators can be reused unchanged.
 *
 * @module lib/eval/extract-tool-sequence
 */
import type { AnthropicEvent } from "@/lib/managed-agents/event-types";

import type { LangfuseObservation } from "./langfuse-api";

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
  startTime: string;
  observationId: string;
}

/**
 * Parses a tool name from an observation.
 * Handles multiple naming patterns used by the Vercel AI SDK telemetry:
 * - TOOL type observations: name is the tool name directly
 * - ai.toolCall.* observations: extract tool name from dotted prefix
 */
function parseToolName(obs: LangfuseObservation): string | null {
  if (obs.type === "TOOL") {
    // For TOOL observations, the name may include a prefix like "ai.toolCall."
    const name = obs.name;
    if (name.startsWith("ai.toolCall.")) {
      return name.replace("ai.toolCall.", "");
    }
    return name;
  }
  return null;
}

/**
 * Extract time-ordered tool call records from Langfuse observations.
 * Filters to TOOL-type observations and sorts by startTime ascending.
 */
export function extractToolSequence(
  observations: LangfuseObservation[],
): ToolCallRecord[] {
  const toolObs = observations
    .filter((obs) => obs.type === "TOOL")
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

  return toolObs
    .map((obs) => {
      const toolName = parseToolName(obs);
      if (!toolName) return null;

      return {
        toolName,
        input: obs.input,
        output: obs.output,
        startTime: obs.startTime,
        observationId: obs.id,
      };
    })
    .filter((r): r is ToolCallRecord => r !== null);
}

/**
 * Back-compat alias — preserved so the existing Langfuse-driven evaluator
 * runner can keep using the original name during the H3 → H4 transition.
 */
export const extractToolSequenceFromObservations = extractToolSequence;

/**
 * Extract a time-ordered tool call sequence from Anthropic Managed Agents
 * events. Pairs:
 *   - `agent.custom_tool_use` with `user.custom_tool_result` (custom tools
 *     dispatched via the runner's MANAGED_AGENT_TOOLS registry)
 *   - `agent.tool_use` with `agent.tool_result` (built-in tools like bash
 *     that execute server-side at Anthropic)
 *
 * Built-in tools are visible to evaluators because the safety gate cares
 * about bash execution and the legacy Langfuse-driven path saw them too.
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
