/**
 * Shared constants for gated tools that require user approval before execution.
 * Used by both the system prompt builder and the safety gate evaluator.
 * @module lib/runner/safety-gates
 */

/** Tools that always require ask_user_question confirmation before execution. */
export const GATED_TOOLS = new Set([
  "configure_crm",
  "delete_records",
  "delete_connection",
  "manage_activated_tools_for_connections",
]);

/**
 * Tools that are gated only under certain conditions.
 * Key: tool name, Value: predicate on the tool input.
 */
export const CONDITIONALLY_GATED_TOOLS = new Map<
  string,
  (input: unknown) => boolean
>([
  [
    "manage_active_triggers",
    (input) => {
      if (typeof input === "object" && input !== null && "action" in input) {
        return (input as { action: string }).action === "delete";
      }
      return false;
    },
  ],
]);

/** Check whether a specific tool call requires prior user approval. */
export function isGatedToolCall(
  toolName: string,
  toolInput?: unknown,
): boolean {
  if (GATED_TOOLS.has(toolName)) return true;
  const predicate = CONDITIONALLY_GATED_TOOLS.get(toolName);
  return predicate ? predicate(toolInput) : false;
}
