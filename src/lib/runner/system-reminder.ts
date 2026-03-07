/**
 * Builds the per-turn system-reminder injected at the end of the system string.
 * @module lib/runner/system-reminder
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

const systemReminderContextSchema = z.object({
  display_name: z.string().nullable(),
  user_email: z.string().nullable(),
  days_since_signup: z.number().int().nullable(),
  open_todo_count: z.number().int().nonnegative(),
  memory_file_count: z.number().int().nonnegative(),
  active_trigger_count: z.number().int().nonnegative(),
  active_connection_toolkits: z.array(z.string()),
});

type SystemReminderContext = z.infer<typeof systemReminderContextSchema>;

const FALLBACK_CONTEXT: SystemReminderContext = {
  display_name: null,
  user_email: null,
  days_since_signup: null,
  open_todo_count: 0,
  memory_file_count: 0,
  active_trigger_count: 0,
  active_connection_toolkits: [],
};

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function fetchReminderContext(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
): Promise<SystemReminderContext> {
  const { data, error } = await supabase.rpc("get_system_reminder_context", {
    p_client_id: clientId,
    p_thread_id: threadId,
  });

  if (error || !data) {
    return FALLBACK_CONTEXT;
  }

  const parsedResult = systemReminderContextSchema.safeParse(data);

  if (!parsedResult.success) {
    return FALLBACK_CONTEXT;
  }

  return {
    display_name: parsedResult.data.display_name ?? null,
    user_email: parsedResult.data.user_email ?? null,
    days_since_signup: parsedResult.data.days_since_signup ?? null,
    open_todo_count: parsedResult.data.open_todo_count ?? 0,
    memory_file_count: parsedResult.data.memory_file_count ?? 0,
    active_trigger_count: parsedResult.data.active_trigger_count ?? 0,
    active_connection_toolkits: parsedResult.data.active_connection_toolkits ?? [],
  };
}

/**
 * Builds the system-reminder XML block for the current run turn.
 */
export async function buildSystemReminder(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
): Promise<string> {
  const context = await fetchReminderContext(supabase, clientId, threadId);

  const now = new Date();
  const currentTime = `${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;

  const reminderLines: string[] = [];
  reminderLines.push(`Current time: ${currentTime}`);

  if (context.display_name) {
    const escapedDisplayName = escapeXml(context.display_name);
    const escapedEmail = context.user_email ? escapeXml(context.user_email) : null;
    reminderLines.push(
      `User: ${escapedDisplayName}${escapedEmail ? ` (${escapedEmail})` : ""}`,
    );
  } else if (context.user_email) {
    reminderLines.push(`User: ${escapeXml(context.user_email)}`);
  }

  reminderLines.push(`Open todos: ${context.open_todo_count}`);
  reminderLines.push(`Memory files: ${context.memory_file_count}`);
  reminderLines.push(`Active triggers: ${context.active_trigger_count}`);
  reminderLines.push(
    `Active connections: ${
      context.active_connection_toolkits.length > 0
        ? context.active_connection_toolkits.map((toolkitSlug) => escapeXml(toolkitSlug)).join(", ")
        : "none"
    }`,
  );

  if (context.days_since_signup !== null) {
    reminderLines.push(`Days since signup: ${context.days_since_signup}`);
  }

  return `<system-reminder>\n${reminderLines.join("\n")}\n</system-reminder>`;
}
