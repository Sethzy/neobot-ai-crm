/**
 * Trigger.dev scheduled task that scans and executes due agent triggers.
 *
 * Calls `runScan()` directly and executes claimed triggers in-process. This
 * keeps the scheduling path inside one worker and avoids a second self-HTTP
 * boundary for internal automation dispatch.
 *
 * @module src/trigger/scan-triggers
 */
import { logger, schedules } from "@trigger.dev/sdk/v3";

import { createAdminClient } from "@/lib/supabase/server";
import { executeTrigger } from "@/lib/triggers/executor";
import { runScan } from "@/lib/triggers/scanner";
import type { TriggerDispatchPayload } from "@/lib/triggers/schemas";

/**
 * Executes one claimed trigger and maps the result into the scanner's dispatch
 * contract. Only claim mismatches are treated as dispatch failures because
 * all other statuses already released their claim inside `executeTrigger()`.
 */
async function executeClaimedTrigger(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  payload: TriggerDispatchPayload,
): Promise<{
  ok: boolean;
  status: number;
  error?: string;
}> {
  try {
    const result = await executeTrigger({
      supabase,
      payload,
    });

    if (result.status === "claim_mismatch") {
      return {
        ok: false,
        status: 409,
        error: "Trigger claim no longer valid",
      };
    }

    return { ok: true, status: 200 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";
    return {
      ok: false,
      status: 500,
      error: `Execution failed: ${message}`,
    };
  }
}

/**
 * Scans for due triggers every minute and executes them.
 */
export const scanTriggers = schedules.task({
  id: "scan-triggers",
  cron: "* * * * *",
  maxDuration: 60,
  run: async () => {
    const supabase = await createAdminClient();
    const result = await runScan({
      supabase,
      dispatch: (payload) => executeClaimedTrigger(supabase, payload),
    });

    logger.info("Scanner tick complete", {
      claimed: result.claimed,
      dispatched: result.dispatched,
      staleReleased: result.staleReleased,
      errors: result.errors,
    });

    return result;
  },
});
