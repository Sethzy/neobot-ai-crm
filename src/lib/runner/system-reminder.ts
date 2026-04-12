/**
 * Per-turn system reminder for the Managed Agents chat adapter.
 *
 * Managed Agents holds every long-lived context layer we used to cram
 * into this block: the system prompt lives on the agent version, the
 * user's profile and preferences are seeded once at session creation,
 * the full conversation history lives in the session's event log, and
 * counts (todos, memory files, triggers, approvals) are queryable via
 * tools on demand.
 *
 * What stays per-turn:
 *   1. Current wall-clock time — the agent cannot know "now" otherwise.
 *   2. Active Composio connections — lets the model reason about which
 *      integrations are live without spending a list_connections tool
 *      call on every integration-adjacent turn.
 *
 * @module lib/runner/system-reminder
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAllConnections } from "@/lib/connections/queries";
import type { Database } from "@/types/database";

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Builds the per-turn system-reminder XML block.
 */
export async function buildSystemReminder(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<string> {
  const now = new Date();
  const currentTime = `${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;
  const connections = await getAllConnections(supabase, clientId).catch(
    (): null => null,
  );

  const lines: string[] = [`Current time: ${currentTime}`];
  const activeConnections =
    connections?.filter((connection) => connection.status === "active") ?? [];

  if (activeConnections.length > 0) {
    const activeConnectionLines = activeConnections.map((connection) => {
      const escapedToolkitSlug = escapeXml(connection.toolkit_slug);
      const escapedConnectionId = escapeXml(connection.id);
      const activatedToolCount = connection.activated_tools.length;

      return `  ${escapedToolkitSlug} (${escapedConnectionId}): ${activatedToolCount}/${connection.tool_count} tools active`;
    });

    lines.push(`Active connections:\n${activeConnectionLines.join("\n")}`);
  } else {
    lines.push("Active connections: none");
  }

  return `<system-reminder>\n${lines.join("\n")}\n</system-reminder>`;
}
