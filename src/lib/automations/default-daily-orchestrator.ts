/**
 * Code-owned defaults and seeding logic for the Daily Orchestrator automation.
 * @module lib/automations/default-daily-orchestrator
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeNextFireAt, normalizeTriggerTimezone } from "@/lib/triggers/cron-utils";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

export const DEFAULT_DAILY_ORCHESTRATOR_NAME = "Daily Orchestrator";
export const DEFAULT_DAILY_ORCHESTRATOR_CRON = "0 8 * * *";
export const DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH =
  "state/triggers/daily-orchestrator.md";
export const DEFAULT_DAILY_ORCHESTRATOR_INVOCATION_MESSAGE =
  "Run the Daily Orchestrator morning pass.";

type DefaultAutomationSupabase = SupabaseClient<Database>;
type SeedDefaultDailyOrchestratorRow = {
  seeded: boolean;
  trigger_id: string | null;
};

/**
 * Creates the default prompt file once without clobbering user edits on later boots.
 */
async function ensureDefaultDailyOrchestratorPromptFile(input: {
  fileClient: ReturnType<typeof createAgentFileClient>;
}): Promise<void> {
  try {
    await input.fileClient.downloadFile(DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH);
    return;
  } catch (error) {
    if (!(error instanceof Error) || !/not found/i.test(error.message)) {
      throw error;
    }
  }

  await input.fileClient.uploadFile(
    DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
    buildDefaultDailyOrchestratorPrompt(),
  );
}

/**
 * Returns the editable default prompt stored in Supabase Storage for the seeded automation.
 */
export function buildDefaultDailyOrchestratorPrompt(): string {
  return [
    "# Daily Orchestrator",
    "",
    "You are the user's morning operator.",
    "",
    "Every morning:",
    "- Brief the day in concise executive-assistant style.",
    "- Do obvious internal work silently when it is low-risk and useful.",
    "- Prepare drafts or recommendations for external-facing work when helpful.",
    "",
    "Hard rules:",
    "- Do not send external-facing messages or take external-facing actions unprompted.",
    "- Do not create child automations, same-day one-off automations, or recurring automations.",
    "- Keep the output proportionate. Quiet days should stay short.",
    "- If the user replies in this thread, continue like a normal conversation and do the work here.",
    "",
    "Output should:",
    "- Lead with the shape of the day.",
    "- Surface only the most important meetings, signals, and follow-ups.",
    "- Mention drafts or prep you already completed.",
    "- End with the most valuable next decisions for the user.",
  ].join("\n");
}

/**
 * Seeds Daily Orchestrator exactly once for a client.
 *
 * The seed marker lives on `clients.daily_orchestrator_seeded_at` so a later
 * user deletion is respected and not recreated on subsequent dashboard loads.
 */
export async function bootstrapDefaultDailyOrchestrator(input: {
  supabase: DefaultAutomationSupabase;
  clientId: string;
  threadId: string;
  timezone: string;
}): Promise<{ seeded: boolean; triggerId: string | null }> {
  const fileClient = createAgentFileClient(input.supabase, input.clientId);
  const normalizedTimezone = normalizeTriggerTimezone(input.timezone);

  const nextFireAt = computeNextFireAt(
    DEFAULT_DAILY_ORCHESTRATOR_CRON,
    new Date(),
    normalizedTimezone,
  );

  const { data, error } = await input.supabase.rpc("seed_default_daily_orchestrator", {
    p_client_id: input.clientId,
    p_thread_id: input.threadId,
    p_name: DEFAULT_DAILY_ORCHESTRATOR_NAME,
    p_instruction_path: DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
    p_invocation_message: DEFAULT_DAILY_ORCHESTRATOR_INVOCATION_MESSAGE,
    p_cron_expression: DEFAULT_DAILY_ORCHESTRATOR_CRON,
    p_payload: {
      cron: DEFAULT_DAILY_ORCHESTRATOR_CRON,
      timezone: normalizedTimezone,
    },
    p_next_fire_at: nextFireAt.toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  const seedResult = Array.isArray(data)
    ? (data[0] as SeedDefaultDailyOrchestratorRow | null | undefined)
    : (data as SeedDefaultDailyOrchestratorRow | null | undefined);

  if (!seedResult) {
    throw new Error("Failed to seed Daily Orchestrator trigger.");
  }

  if (seedResult.seeded) {
    await ensureDefaultDailyOrchestratorPromptFile({ fileClient });
  }

  return {
    seeded: seedResult.seeded,
    triggerId: seedResult.trigger_id,
  };
}
