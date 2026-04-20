/**
 * Per-turn system reminder for the Managed Agents chat adapter.
 *
 * Holds only the current wall-clock time. Everything else is either durable on
 * the managed-agent session or queryable through tools on demand.
 *
 * @module lib/runner/system-reminder
 */

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getCurrentTimeLine(now = new Date()): string {
  return `Current time: ${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

function renderSystemReminder(lines: string[]): string {
  return `<system-reminder>\n${lines.join("\n")}\n</system-reminder>`;
}

export function buildFallbackSystemReminder(): string {
  return renderSystemReminder([getCurrentTimeLine()]);
}

/**
 * Builds the per-turn system-reminder XML block.
 */
export async function buildSystemReminder(
  _supabase: unknown,
  _clientId: string,
): Promise<string> {
  void _supabase;
  void _clientId;
  return renderSystemReminder([getCurrentTimeLine()]);
}
