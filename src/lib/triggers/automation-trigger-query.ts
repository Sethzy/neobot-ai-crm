/**
 * Shared automation trigger query definitions and data loader.
 *
 * This module is intentionally server/client-safe so the automations route can
 * prefetch its first render on the server while the client hook reuses the
 * exact same query key and fetcher.
 *
 * @module lib/triggers/automation-trigger-query
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type AutomationTrigger = Pick<
  Database["public"]["Tables"]["agent_triggers"]["Row"],
  | "id"
  | "thread_id"
  | "name"
  | "trigger_type"
  | "cron_expression"
  | "payload"
  | "enabled"
  | "next_fire_at"
  | "last_fired_at"
  | "last_status"
  | "invocation_message"
  | "instruction_path"
> & {
  isRunning?: boolean;
};

export const TRIGGER_LIST_SELECT = [
  "id",
  "thread_id",
  "name",
  "trigger_type",
  "cron_expression",
  "payload",
  "enabled",
  "next_fire_at",
  "last_fired_at",
  "last_status",
  "invocation_message",
  "instruction_path",
].join(", ");

export const triggerKeys = {
  all: ["triggers"] as const,
  lists: () => [...triggerKeys.all, "list"] as const,
  list: () => [...triggerKeys.lists(), "all"] as const,
};

/**
 * Loads all user-visible automations and decorates them with the derived
 * running state used by the page badges.
 */
export async function listAutomationTriggers(
  supabaseClient: Pick<SupabaseClient<Database>, "from">,
): Promise<AutomationTrigger[]> {
  const { data, error } = await supabaseClient
    .from("agent_triggers")
    .select(TRIGGER_LIST_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const triggers = (data ?? []) as unknown as Omit<AutomationTrigger, "isRunning">[];

  if (triggers.length === 0) {
    return [];
  }

  const { data: runningRuns, error: runningRunsError } = await supabaseClient
    .from("runs")
    .select("trigger_id")
    .eq("status", "running")
    .not("trigger_id", "is", null);

  if (runningRunsError) {
    throw runningRunsError;
  }

  const runningTriggerIds = new Set(
    (runningRuns ?? [])
      .map((run) => run.trigger_id)
      .filter((triggerId): triggerId is string => typeof triggerId === "string"),
  );

  return triggers.map((trigger) => ({
    ...trigger,
    isRunning: runningTriggerIds.has(trigger.id),
  }));
}
