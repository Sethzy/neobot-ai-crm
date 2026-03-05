/**
 * Cron scanner business logic for claiming, dispatching, and advancing triggers.
 * @module lib/triggers/scanner
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { computeNextFireAt } from "./cron-utils";
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
  dispatch: (payload: TriggerDispatchPayload) => Promise<{ ok: boolean }>;
}

async function releaseClaim(
  supabase: TriggerSupabaseClient,
  trigger: TriggerRow,
  status: string,
): Promise<void> {
  if (!trigger.current_run_id) {
    throw new Error(`Claimed trigger ${trigger.id} is missing current_run_id.`);
  }

  const { data, error } = await supabase.rpc("release_trigger_claim", {
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

function buildDispatchPayload(trigger: TriggerRow): TriggerDispatchPayload {
  if (!trigger.current_run_id) {
    throw new Error("Claimed trigger is missing current_run_id");
  }

  return {
    triggerId: trigger.id,
    clientId: trigger.client_id,
    threadId: trigger.thread_id,
    currentRunId: trigger.current_run_id,
    triggerName: trigger.name,
    instructionPath: trigger.instruction_path,
    triggerPayload: trigger.payload,
  };
}

/**
 * Runs one scanner tick against all due triggers.
 */
export async function runScan({ supabase, dispatch }: ScanDependencies): Promise<ScanResult> {
  const staleReleased = await reapStaleClaims(supabase);
  const claimedTriggers = await claimDueTriggers(supabase);
  const errors: string[] = [];
  let dispatched = 0;

  for (const trigger of claimedTriggers) {
    try {
      if (trigger.trigger_type === "schedule") {
        if (!trigger.cron_expression || !trigger.current_run_id || !trigger.next_fire_at) {
          throw new Error("invalid cron");
        }

        const nextFireAt = computeNextFireAt(
          trigger.cron_expression,
          new Date(trigger.next_fire_at),
        );
        const dispatchResult = await dispatch(buildDispatchPayload(trigger));
        if (!dispatchResult.ok) {
          await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS);
          errors.push(`${trigger.id}: dispatch returned not ok`);
          continue;
        }

        await updateTrigger(supabase, trigger.id, {
          next_fire_at: nextFireAt.toISOString(),
        });
        dispatched += 1;
        continue;
      }

      const dispatchResult = await dispatch(buildDispatchPayload(trigger));
      if (!dispatchResult.ok) {
        await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS);
        errors.push(`${trigger.id}: dispatch returned not ok`);
        continue;
      }

      dispatched += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scanner error";

      if (message === "invalid cron") {
        await updateTrigger(supabase, trigger.id, {
          enabled: false,
          last_status: INVALID_CRON_STATUS,
        });
        await releaseClaim(supabase, trigger, INVALID_CRON_STATUS);
      } else if (trigger.current_run_id) {
        await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS);
      }

      errors.push(`${trigger.id}: ${message}`);
    }
  }

  return scanResultSchema.parse({
    claimed: claimedTriggers.length,
    dispatched,
    staleReleased,
    errors,
  });
}
