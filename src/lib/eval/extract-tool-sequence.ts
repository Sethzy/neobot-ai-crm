/**
 * Extracts an ordered sequence of tool call records from Langfuse observations.
 * Used by evaluators to inspect the agent's tool call timeline.
 * @module lib/eval/extract-tool-sequence
 */
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
