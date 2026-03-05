/**
 * Cron scanner business logic for claiming due triggers and dispatching them.
 * @module lib/triggers/scanner
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isInQuietHours } from "@/lib/autopilot/quiet-hours";
import type { Database } from "@/types/database";

import { computeNextFireAt, InvalidCronExpressionError } from "./cron-utils";
import {
  scanResultSchema,
  type ScanResult,
  type TriggerDispatchPayload,
  type TriggerRow,
  triggerRowSchema,
} from "./schemas";

const STALE_CLAIM_MINUTES = 15;
const DISPATCH_FAILED_STATUS = "dispatch_failed";
const INVALID_CRON_STATUS = "invalid_cron";

type TriggerSupabaseClient = SupabaseClient<Database>;

export interface ScanDependencies {
  supabase: TriggerSupabaseClient;
  dispatch: (payload: TriggerDispatchPayload) => Promise<{
    ok: boolean;
    status: number;
    error?: string;
  }>;
  now?: Date;
}

async function releaseClaim(
  supabase: TriggerSupabaseClient,
  trigger: TriggerRow,
  status: string,
  nextFireAt?: string,
): Promise<void> {
  if (!trigger.current_run_id) {
    throw new Error(`Claimed trigger ${trigger.id} is missing current_run_id.`);
  }

  const { data, error } = await supabase.rpc("release_trigger_claim", {
    p_next_fire_at: nextFireAt ?? null,
    p_trigger_id: trigger.id,
    p_run_id: trigger.current_run_id,
    p_status: status,
  });

  if (error) {
    throw new Error(`Failed to release trigger claim: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Failed to release trigger claim for ${trigger.id}.`);
  }
}

async function updateTrigger(
  supabase: TriggerSupabaseClient,
  triggerId: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("agent_triggers").update(update).eq("id", triggerId);

  if (error) {
    throw new Error(`Failed to update trigger ${triggerId}: ${error.message}`);
  }
}

async function reapStaleClaims(supabase: TriggerSupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("release_stale_trigger_claims", {
    p_stale_minutes: STALE_CLAIM_MINUTES,
  });

  if (error) {
    throw new Error(`Failed to release stale trigger claims: ${error.message}`);
  }

  return Number(data ?? 0);
}

async function claimDueTriggers(supabase: TriggerSupabaseClient): Promise<TriggerRow[]> {
  const { data, error } = await supabase.rpc("claim_due_triggers");

  if (error) {
    throw new Error(`Failed to claim due triggers: ${error.message}`);
  }

  return triggerRowSchema.array().parse(data ?? []);
}

async function fetchAutopilotConfig(
  supabase: TriggerSupabaseClient,
  clientId: string,
): Promise<{
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
} | null> {
  const { data, error } = await supabase
    .from("autopilot_config")
    .select("quiet_hours_start, quiet_hours_end")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load autopilot config: ${error.message}`);
  }

  return data;
}

function buildDispatchPayload(trigger: TriggerRow): TriggerDispatchPayload {
  if (!trigger.current_run_id) {
    throw new Error("Claimed trigger is missing current_run_id");
  }

  return {
    triggerId: trigger.id,
    clientId: trigger.client_id,
    threadId: trigger.thread_id,
    currentRunId: trigger.current_run_id,
    triggerType: trigger.trigger_type,
    triggerName: trigger.name,
    instructionPath: trigger.instruction_path,
    triggerPayload: trigger.payload,
  };
}

function formatDispatchFailure(result: {
  status: number;
  error?: string;
}): string {
  const detail = result.error?.trim();

  if (!detail) {
    return `dispatch returned ${result.status}`;
  }

  return `dispatch returned ${result.status} (${detail})`;
}

function isInvalidCronError(error: unknown): boolean {
  return (
    error instanceof InvalidCronExpressionError ||
    (error instanceof Error && error.name === "InvalidCronExpressionError")
  );
}

/**
 * Runs one scanner tick against all due triggers.
 */
export async function runScan({
  supabase,
  dispatch,
  now = new Date(),
}: ScanDependencies): Promise<ScanResult> {
  const staleReleased = await reapStaleClaims(supabase);
  const claimedTriggers = await claimDueTriggers(supabase);
  const errors: string[] = [];
  let dispatched = 0;

  for (const trigger of claimedTriggers) {
    try {
      if (trigger.trigger_type === "schedule" || trigger.trigger_type === "pulse") {
        if (!trigger.cron_expression || !trigger.current_run_id || !trigger.next_fire_at) {
          throw new InvalidCronExpressionError("Trigger is missing cron scheduling fields.");
        }

        const nextFireAt = computeNextFireAt(
          trigger.cron_expression,
          new Date(trigger.next_fire_at),
        );

        if (trigger.trigger_type === "pulse") {
          const autopilotConfig = await fetchAutopilotConfig(supabase, trigger.client_id);

          if (
            autopilotConfig &&
            isInQuietHours({
              quietHoursStart: autopilotConfig.quiet_hours_start,
              quietHoursEnd: autopilotConfig.quiet_hours_end,
              now,
            })
          ) {
            await releaseClaim(
              supabase,
              trigger,
              "skipped_quiet_hours",
              nextFireAt.toISOString(),
            );
            continue;
          }
        }

        const dispatchResult = await dispatch({
          ...buildDispatchPayload(trigger),
          nextFireAt: nextFireAt.toISOString(),
        });
        if (!dispatchResult.ok) {
          await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS);
          errors.push(`${trigger.id}: ${formatDispatchFailure(dispatchResult)}`);
          continue;
        }

        dispatched += 1;
        continue;
      }

      const dispatchResult = await dispatch(buildDispatchPayload(trigger));
      if (!dispatchResult.ok) {
        await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS);
        errors.push(`${trigger.id}: ${formatDispatchFailure(dispatchResult)}`);
        continue;
      }

      dispatched += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scanner error";

      if (isInvalidCronError(error)) {
        await updateTrigger(supabase, trigger.id, {
          enabled: false,
          last_status: INVALID_CRON_STATUS,
        });
        await releaseClaim(supabase, trigger, INVALID_CRON_STATUS);
        errors.push(`${trigger.id}: invalid cron`);
      } else if (trigger.current_run_id) {
        await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS);
        errors.push(`${trigger.id}: ${message}`);
      }
    }
  }

  return scanResultSchema.parse({
    claimed: claimedTriggers.length,
    dispatched,
    staleReleased,
    errors,
  });
}
