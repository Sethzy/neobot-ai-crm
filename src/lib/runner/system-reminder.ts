/**
 * Builds the per-turn system-reminder injected at the end of the system string.
 * @module lib/runner/system-reminder
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getAllConnections } from "@/lib/connections/queries";
import { toModelPath } from "@/lib/storage/agent-paths";
import { getConnectionSkillContent } from "@/lib/storage/skill-files";
import type { Database } from "@/types/database";

const systemReminderContextSchema = z.object({
  display_name: z.string().nullable(),
  user_email: z.string().nullable(),
  days_since_signup: z.number().int().nullable(),
  open_todo_count: z.number().int().nonnegative(),
  memory_file_count: z.number().int().nonnegative(),
  active_trigger_count: z.number().int().nonnegative(),
  pending_approval_count: z.number().int().nonnegative(),
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
  pending_approval_count: 0,
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
    pending_approval_count: parsedResult.data.pending_approval_count ?? 0,
    active_connection_toolkits: parsedResult.data.active_connection_toolkits ?? [],
  };
}

interface BuildSystemReminderOptions {
  /** When true, injects a CRM configuration mode active notice. */
  crmConfigModeActive?: boolean;
}

/**
 * Builds the system-reminder XML block for the current run turn.
 */
export async function buildSystemReminder(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
  options?: BuildSystemReminderOptions,
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
  if (context.pending_approval_count > 0) {
    reminderLines.push(`Pending approvals: ${context.pending_approval_count}`);
  }

  let connections: Awaited<ReturnType<typeof getAllConnections>> | null = null;

  try {
    connections = await getAllConnections(supabase, clientId);
  } catch {
    reminderLines.push("Active connections: none");
  }

  if (connections) {
    const activeConnections = connections.filter((connection) => connection.status === "active");

    if (activeConnections.length > 0) {
      const activeConnectionLines = await Promise.all(
        activeConnections.map(async (connection) => {
          let skillContent: string | null = null;

          try {
            skillContent = await getConnectionSkillContent(supabase, clientId, connection.id);
          } catch {
            skillContent = null;
          }

          const escapedToolkitSlug = escapeXml(connection.toolkit_slug);
          const escapedConnectionId = escapeXml(connection.id);
          const activatedToolCount = connection.activated_tools.length;
          const skillPointer = skillContent
            ? ` (skill: ${toModelPath(`skills/connections/${escapedConnectionId}/SKILL.md`)})`
            : "";

          return `  ${escapedToolkitSlug} (${escapedConnectionId}): ${activatedToolCount}/${connection.tool_count} tools active${skillPointer}`;
        }),
      );

      reminderLines.push(`Active connections:\n${activeConnectionLines.join("\n")}`);
    } else {
      reminderLines.push("Active connections: none");
    }

    const inactiveConnectionCount = connections.filter(
      (connection) => connection.status !== "active" && connection.status !== "pending",
    ).length;

    if (inactiveConnectionCount > 0) {
      reminderLines.push(`Inactive connections: ${inactiveConnectionCount}`);
    }
  }

  if (options?.crmConfigModeActive) {
    reminderLines.push(
      "CRM configuration mode: ACTIVE — configure_crm and disable_crm_config_mode tools are available. " +
      "Use configure_crm to reconfigure CRM fields/stages, then call disable_crm_config_mode when done.",
    );
  }

  if (context.days_since_signup !== null) {
    reminderLines.push(`Days since signup: ${context.days_since_signup}`);
  }

  return `<system-reminder>\n${reminderLines.join("\n")}\n</system-reminder>`;
}
