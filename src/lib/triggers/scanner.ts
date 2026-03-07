/**
 * Cron scanner business logic for claiming due triggers and dispatching them.
 * @module lib/triggers/scanner
 */
import { isInQuietHours } from "@/lib/autopilot/quiet-hours";

import {
  computeNextFireAt,
  InvalidCronExpressionError,
  normalizeTriggerTimezone,
} from "./cron-utils";
import {
  type ScanResult,
  type TriggerDispatchPayload,
  type TriggerRow,
  type TriggerSupabaseClient,
  triggerRowSchema,
} from "./schemas";

const STALE_CLAIM_MINUTES = 15;
const DISPATCH_FAILED_STATUS = "dispatch_failed";
const INVALID_CRON_STATUS = "invalid_cron";
const INVALID_RSS_CONFIG_STATUS = "invalid_rss_config";
const FAILED_PERMANENT_STATUS = "failed_permanent";
const MAX_SCHEDULE_CATCH_UP_STEPS = 64;
const MAX_USER_CREATED_RETRIES = 2;
const MAX_PULSE_RETRIES = 0;

class InvalidRssConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRssConfigError";
  }
}

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
  options?: {
    nextFireAt?: string | null;
    advanceNextFireAt?: boolean;
  },
): Promise<void> {
  if (!trigger.current_run_id) {
    throw new Error(`Claimed trigger ${trigger.id} is missing current_run_id.`);
  }

  const { data, error } = await supabase.rpc("release_trigger_claim", {
    p_next_fire_at: options?.nextFireAt ?? null,
    p_advance_next_fire_at: options?.advanceNextFireAt ?? true,
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
    invocationMessage: trigger.invocation_message,
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

function isInvalidRssConfigError(error: unknown): boolean {
  return (
    error instanceof InvalidRssConfigError ||
    (error instanceof Error && error.name === "InvalidRssConfigError")
  );
}

function resolveTriggerTimezone(trigger: TriggerRow): string {
  const rawTimezone = typeof trigger.payload.timezone === "string"
    ? trigger.payload.timezone
    : trigger.trigger_type === "pulse"
      ? "UTC"
      : undefined;

  return normalizeTriggerTimezone(rawTimezone);
}

function getMaxRetryCount(trigger: TriggerRow): number {
  return trigger.trigger_type === "pulse" ? MAX_PULSE_RETRIES : MAX_USER_CREATED_RETRIES;
}

function hasExhaustedRetries(trigger: TriggerRow): boolean {
  return trigger.retry_count >= getMaxRetryCount(trigger);
}

function assertValidRssTrigger(trigger: TriggerRow): void {
  if (!trigger.current_run_id || !trigger.cron_expression || !trigger.next_fire_at) {
    throw new InvalidRssConfigError("RSS trigger is missing scheduling fields.");
  }

  if (typeof trigger.payload.feed_url !== "string" || !trigger.payload.feed_url.trim()) {
    throw new InvalidRssConfigError("RSS trigger is missing feed_url.");
  }
}

/**
 * Advances a stale scheduled trigger until the next fire time is strictly in
 * the future relative to the current scan tick. Quiet-hours skips can otherwise
 * get trapped repeatedly rescheduling already-expired pulse windows.
 */
function advanceNextFireAtPastNow(
  cronExpression: string,
  nextFireAt: Date,
  now: Date,
  timezone: string,
): Date {
  let candidate = nextFireAt;

  for (let step = 0; candidate <= now; step += 1) {
    if (step >= MAX_SCHEDULE_CATCH_UP_STEPS) {
      throw new Error(`Failed to advance next_fire_at past now for cron expression: ${cronExpression}`);
    }

    candidate = computeNextFireAt(cronExpression, candidate, timezone);
  }

  return candidate;
}

/**
 * Runs one scanner tick against all due triggers.
 */
export async function runScan({
  supabase,
  dispatch,
  now = new Date(),
}: ScanDependencies): Promise<ScanResult> {
  const [staleReleased, claimedTriggers] = await Promise.all([
    reapStaleClaims(supabase),
    claimDueTriggers(supabase),
  ]);
  const errors: string[] = [];
  let dispatched = 0;

  for (const trigger of claimedTriggers) {
    try {
      let scheduledNextFireAt: string | null = null;

      if (
        trigger.trigger_type === "schedule"
        || trigger.trigger_type === "pulse"
        || trigger.trigger_type === "rss"
      ) {
        if (trigger.trigger_type === "rss") {
          assertValidRssTrigger(trigger);
        }

        if (!trigger.cron_expression || !trigger.current_run_id || !trigger.next_fire_at) {
          throw new InvalidCronExpressionError("Trigger is missing cron scheduling fields.");
        }

        const timezone = resolveTriggerTimezone(trigger);
        const nextFireAt = computeNextFireAt(
          trigger.cron_expression,
          new Date(trigger.next_fire_at),
          timezone,
        );
        scheduledNextFireAt = nextFireAt.toISOString();

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
            const nextFireAtAfterNow = advanceNextFireAtPastNow(
              trigger.cron_expression,
              nextFireAt,
              now,
              timezone,
            );
            await releaseClaim(
              supabase,
              trigger,
              "skipped_quiet_hours",
              {
                nextFireAt: nextFireAtAfterNow.toISOString(),
                advanceNextFireAt: true,
              },
            );
            continue;
          }
        }

        const dispatchResult = await dispatch({
          ...buildDispatchPayload(trigger),
          nextFireAt: scheduledNextFireAt,
        });
        if (!dispatchResult.ok) {
          if (trigger.trigger_type === "pulse") {
            await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS, {
              nextFireAt: scheduledNextFireAt,
              advanceNextFireAt: true,
            });
          } else {
            await releaseClaim(
              supabase,
              trigger,
              hasExhaustedRetries(trigger) ? FAILED_PERMANENT_STATUS : DISPATCH_FAILED_STATUS,
              {
                advanceNextFireAt: false,
              },
            );
          }
          errors.push(`${trigger.id}: ${formatDispatchFailure(dispatchResult)}`);
          continue;
        }

        dispatched += 1;
        continue;
      }

      const dispatchResult = await dispatch(buildDispatchPayload(trigger));
      if (!dispatchResult.ok) {
        await releaseClaim(
          supabase,
          trigger,
          hasExhaustedRetries(trigger) ? FAILED_PERMANENT_STATUS : DISPATCH_FAILED_STATUS,
          {
            advanceNextFireAt: false,
          },
        );
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
        await releaseClaim(supabase, trigger, INVALID_CRON_STATUS, {
          advanceNextFireAt: false,
        });
        errors.push(`${trigger.id}: invalid cron`);
      } else if (isInvalidRssConfigError(error)) {
        await updateTrigger(supabase, trigger.id, {
          enabled: false,
          last_status: INVALID_RSS_CONFIG_STATUS,
        });
        await releaseClaim(supabase, trigger, INVALID_RSS_CONFIG_STATUS, {
          advanceNextFireAt: false,
        });
        errors.push(`${trigger.id}: invalid rss config`);
      } else if (trigger.current_run_id) {
        if (trigger.trigger_type === "pulse" && trigger.cron_expression && trigger.next_fire_at) {
          const timezone = resolveTriggerTimezone(trigger);
          const nextFireAt = computeNextFireAt(
            trigger.cron_expression,
            new Date(trigger.next_fire_at),
            timezone,
          );
          await releaseClaim(supabase, trigger, DISPATCH_FAILED_STATUS, {
            nextFireAt: nextFireAt.toISOString(),
            advanceNextFireAt: true,
          });
        } else {
          await releaseClaim(
            supabase,
            trigger,
            hasExhaustedRetries(trigger) ? FAILED_PERMANENT_STATUS : DISPATCH_FAILED_STATUS,
            {
              advanceNextFireAt: false,
            },
          );
        }
        errors.push(`${trigger.id}: ${message}`);
      }
    }
  }

  const result: ScanResult = {
    claimed: claimedTriggers.length,
    dispatched,
    staleReleased,
    errors,
  };
  return result;
}
