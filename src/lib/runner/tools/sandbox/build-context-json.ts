/**
 * Serializes accumulated tool results into context.json for sandbox scripts.
 * @module lib/runner/tools/sandbox/build-context-json
 */
import type { SandboxContextEntry } from "./types";

/** Tools whose results are not useful inside sandbox scripts. */
const EXCLUDED_TOOLS = new Set([
  "bash",
  "write_file",
  "rename_chat",
  "send_message",
  "reply_message",
  "add_contact_method",
  "setup_trigger",
  "manage_active_triggers",
  "create_new_connections",
  "delete_connection",
  "reauthorize_connection",
  "manage_activated_tools_for_connections",
  "ask_user_question",
  "manage_todo",
  "list_todo",
]);

/** Returns true if a read_file output contains binary data (image/PDF) that would bloat context.json. */
function isMultimodalOutput(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return false;
  const typed = output as Record<string, unknown>;
  return typed.type === "image" || typed.type === "pdf";
}

/** Maximum serialized size before truncation (500 KB). */
const MAX_CONTEXT_BYTES = 500_000;

/**
 * Builds the JSON string written to /vercel/sandbox/workspace/input/context.json.
 *
 * Cloned from the file-assembly pattern in call-summary-agent's
 * `generateFilesForSandbox()` — adapted for Sunder's dynamic tool results.
 */
export function buildContextJson(entries: SandboxContextEntry[]): string {
  const filtered = entries.filter(
    (e) => !EXCLUDED_TOOLS.has(e.toolName) && !isMultimodalOutput(e.output),
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    tools: filtered.map((e) => ({
      toolCallId: e.toolCallId,
      toolName: e.toolName,
      input: e.input,
      output: e.output,
    })),
  };

  let json = JSON.stringify(payload, null, 2);

  if (Buffer.byteLength(json) > MAX_CONTEXT_BYTES) {
    // Drop oldest entries until under budget
    const trimmed = [...filtered];
    while (trimmed.length > 0 && Buffer.byteLength(json) > MAX_CONTEXT_BYTES) {
      trimmed.shift();
      const reduced = {
        _truncated: true,
        generatedAt: payload.generatedAt,
        tools: trimmed.map((e) => ({
          toolCallId: e.toolCallId,
          toolName: e.toolName,
          input: e.input,
          output: e.output,
        })),
      };
      json = JSON.stringify(reduced, null, 2);
    }
  }

  return json;
}
