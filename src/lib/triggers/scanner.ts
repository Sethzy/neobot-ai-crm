/**
 * Cron scanner business logic for claiming due triggers and dispatching them.
 * @module lib/triggers/scanner
 */

import {
  computeNextFireAt,
  InvalidCronExpressionError,
  normalizeTriggerTimezone,
} from "./cron-utils";
import {
  MAX_USER_CREATED_RETRIES,
  releaseTriggerClaim,
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

interface TriggerScanResult {
  dispatched: number;
  errors: string[];
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

  await releaseTriggerClaim(supabase, trigger.id, trigger.current_run_id, status, options);
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

function isNamedError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function isInvalidCronError(error: unknown): boolean {
  return error instanceof InvalidCronExpressionError || isNamedError(error, "InvalidCronExpressionError");
}

function isInvalidRssConfigError(error: unknown): boolean {
  return error instanceof InvalidRssConfigError || isNamedError(error, "InvalidRssConfigError");
}

function resolveTriggerTimezone(trigger: TriggerRow): string {
  const rawTimezone = typeof trigger.payload.timezone === "string"
    ? trigger.payload.timezone
    : undefined;

  return normalizeTriggerTimezone(rawTimezone);
}

function hasExhaustedRetries(trigger: TriggerRow): boolean {
  return trigger.retry_count >= MAX_USER_CREATED_RETRIES;
}

function assertValidRssTrigger(trigger: TriggerRow): void {
  if (!trigger.current_run_id || !trigger.cron_expression || !trigger.next_fire_at) {
    throw new InvalidRssConfigError("RSS trigger is missing scheduling fields.");
  }

  if (typeof trigger.payload.feed_url !== "string" || !trigger.payload.feed_url.trim()) {
    throw new InvalidRssConfigError("RSS trigger is missing feed_url.");
  }
}

async function processClaimedTrigger(
  supabase: TriggerSupabaseClient,
  trigger: TriggerRow,
  dispatch: ScanDependencies["dispatch"],
  now: Date,
): Promise<TriggerScanResult> {
  const errors: string[] = [];
  let dispatched = 0;
  void now;

  try {
    let scheduledNextFireAt: string | null = null;

    if (
      trigger.trigger_type === "schedule"
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

      const dispatchResult = await dispatch({
        ...buildDispatchPayload(trigger),
        nextFireAt: scheduledNextFireAt,
      });
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
        return { dispatched, errors };
      }

      dispatched += 1;
      return { dispatched, errors };
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
      return { dispatched, errors };
    }

    dispatched += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scanner error";

    if (isInvalidCronError(error)) {
      await Promise.all([
        updateTrigger(supabase, trigger.id, {
          enabled: false,
          last_status: INVALID_CRON_STATUS,
        }),
        releaseClaim(supabase, trigger, INVALID_CRON_STATUS, {
          advanceNextFireAt: false,
        }),
      ]);
      errors.push(`${trigger.id}: invalid cron`);
    } else if (isInvalidRssConfigError(error)) {
      await Promise.all([
        updateTrigger(supabase, trigger.id, {
          enabled: false,
          last_status: INVALID_RSS_CONFIG_STATUS,
        }),
        releaseClaim(supabase, trigger, INVALID_RSS_CONFIG_STATUS, {
          advanceNextFireAt: false,
        }),
      ]);
      errors.push(`${trigger.id}: invalid rss config`);
    } else if (trigger.current_run_id) {
      await releaseClaim(
        supabase,
        trigger,
        hasExhaustedRetries(trigger) ? FAILED_PERMANENT_STATUS : DISPATCH_FAILED_STATUS,
        {
          advanceNextFireAt: false,
        },
      );
      errors.push(`${trigger.id}: ${message}`);
    }
  }

  return { dispatched, errors };
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
  const settledResults = await Promise.allSettled(
    claimedTriggers.map((trigger) => processClaimedTrigger(supabase, trigger, dispatch, now)),
  );
  const errors: string[] = [];
  let dispatched = 0;

  for (const [index, settledResult] of settledResults.entries()) {
    if (settledResult.status === "fulfilled") {
      dispatched += settledResult.value.dispatched;
      errors.push(...settledResult.value.errors);
      continue;
    }

    const triggerId = claimedTriggers[index]?.id ?? "unknown";
    const reason = settledResult.reason instanceof Error
      ? settledResult.reason.message
      : String(settledResult.reason);
    errors.push(`${triggerId}: ${reason}`);
  }

  const result: ScanResult = {
    claimed: claimedTriggers.length,
    dispatched,
    staleReleased,
    errors,
  };
  return result;
}
