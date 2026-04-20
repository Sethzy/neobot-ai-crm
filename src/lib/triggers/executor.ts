/**
 * Trigger execution logic for cron-dispatched agent runs.
 * @module lib/triggers/executor
 */
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import {
  AutomationAlreadyRunningError,
  spawnTriggerRun,
} from "@/lib/managed-agents/spawn-trigger-run";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import { toModelPath } from "@/lib/storage/agent-paths";

import { collectNewRssItems } from "./rss";
import { CRON_RUN_NUDGE, MAX_USER_CREATED_RETRIES, releaseTriggerClaim, type TriggerDispatchPayload, type TriggerSupabaseClient } from "./schemas";
import { buildTriggerEventMessage } from "./trigger-event";

export interface ExecuteTriggerInput {
  supabase: TriggerSupabaseClient;
  payload: TriggerDispatchPayload;
}

export interface ExecuteTriggerResult {
  status: "completed" | "failed" | "claim_mismatch" | "queued" | "skipped_busy";
}

function toAnalyticsTriggerType(
  triggerType: TriggerDispatchPayload["triggerType"],
): "cron" | "webhook" | "rss" | "pulse" {
  return triggerType === "schedule" ? "cron" : triggerType;
}

async function captureTriggerExecutionEvent(args: {
  clientId: string;
  threadId: string;
  triggerId: string;
  triggerType: TriggerDispatchPayload["triggerType"];
  startedAt: number;
  resultStatus:
    | "completed"
    | "failed"
    | "failed_permanent"
    | "queued"
    | "skipped_busy";
}): Promise<void> {
  await captureServerEvent({
    distinctId: args.clientId,
    event: "trigger_executed",
    properties: {
      trigger_id: args.triggerId,
      thread_id: args.threadId,
      trigger_type: toAnalyticsTriggerType(args.triggerType),
      result_status: args.resultStatus,
      success: args.resultStatus === "completed",
      duration_ms: Date.now() - args.startedAt,
    },
  });
}

async function releaseClaim(
  supabase: TriggerSupabaseClient,
  payload: TriggerDispatchPayload,
  status:
    | ExecuteTriggerResult["status"]
    | "skipped_thread_busy"
    | "failed_permanent",
  options?: {
    nextFireAt?: string | null;
    advanceNextFireAt?: boolean;
  },
): Promise<void> {
  const nextFireAt = options && "nextFireAt" in options
    ? options.nextFireAt ?? null
    : payload.nextFireAt ?? null;

  await releaseTriggerClaim(supabase, payload.triggerId, payload.currentRunId, status, {
    nextFireAt,
    advanceNextFireAt: options?.advanceNextFireAt,
  });
}

/**
 * Validates and executes one claimed trigger.
 */
export async function executeTrigger({
  supabase,
  payload,
}: ExecuteTriggerInput): Promise<ExecuteTriggerResult> {
  const startedAt = Date.now();

  const captureEvent = (
    resultStatus: Parameters<typeof captureTriggerExecutionEvent>[0]["resultStatus"],
  ) =>
    captureTriggerExecutionEvent({
      clientId: payload.clientId,
      threadId: payload.threadId,
      triggerId: payload.triggerId,
      triggerType: payload.triggerType,
      startedAt,
      resultStatus,
    });

  /** Releases claim, fires analytics event, and returns the result in one call. */
  const finish = async (
    claimStatus: "completed" | "failed" | "failed_permanent" | "queued" | "skipped_thread_busy",
    options?: Parameters<typeof releaseClaim>[3],
  ): Promise<ExecuteTriggerResult> => {
    await releaseClaim(supabase, payload, claimStatus, options);
    await captureEvent(
      claimStatus === "skipped_thread_busy" ? "skipped_busy" : claimStatus,
    );
    return {
      status: claimStatus === "skipped_thread_busy"
        ? "skipped_busy"
        : claimStatus === "failed_permanent"
          ? "failed"
          : claimStatus,
    };
  };

  const { data: trigger, error } = await supabase
    .from("agent_triggers")
    .select("id, current_run_id, retry_count")
    .eq("id", payload.triggerId)
    .single();

  if (error) {
    throw new Error(`Failed to load trigger claim: ${error.message}`);
  }

  if (!trigger || trigger.current_run_id !== payload.currentRunId) {
    return { status: "claim_mismatch" };
  }

  const hasExhaustedRetries =
    payload.triggerType !== "pulse" && trigger.retry_count >= MAX_USER_CREATED_RETRIES;

  if (payload.triggerType === "pulse") {
    try {
      await spawnTriggerRun(supabase, {
        runId: payload.currentRunId,
        clientId: payload.clientId,
        threadId: payload.threadId,
        triggerType: "autopilot",
        invocationMessage: AUTOPILOT_INSTRUCTION_PROMPT,
        triggerId: payload.triggerId,
        triggerName: payload.triggerName,
      });
      return finish("queued", { advanceNextFireAt: true });
    } catch (error) {
      if (error instanceof AutomationAlreadyRunningError) {
        console.info("[executor] Pulse trigger skipped because automation is busy", {
          triggerId: payload.triggerId,
          currentRunId: payload.currentRunId,
        });
        return finish("skipped_thread_busy", { advanceNextFireAt: true });
      }

      console.error("[executor] pulse trigger failed:", error);
      return finish("failed", { advanceNextFireAt: true });
    }
  }

  let triggerEventPayload = payload.triggerPayload;

  if (payload.triggerType === "rss") {
    try {
      const fileClient = createAgentFileClient(supabase, payload.clientId);
      const feedUrl = typeof payload.triggerPayload.feed_url === "string"
        ? payload.triggerPayload.feed_url
        : "";

      const rssResult = await collectNewRssItems({
        fileClient,
        triggerId: payload.triggerId,
        feedUrl,
      });

      if (rssResult.newItems.length === 0) {
        return finish("completed", { advanceNextFireAt: true });
      }

      triggerEventPayload = {
        feed_url: feedUrl,
        feed_title: rssResult.feed.title,
        new_item_count: rssResult.newItems.length,
        new_items: rssResult.newItems,
        seen_state_path: toModelPath(rssResult.statePath),
      };
    } catch (error) {
      console.error("[executor] rss trigger failed:", error);
      return finish(
        hasExhaustedRetries ? "failed_permanent" : "failed",
        { nextFireAt: null, advanceNextFireAt: false },
      );
    }
  }

  const triggerEventMessage = buildTriggerEventMessage({
    triggerId: payload.triggerId,
    triggerType: payload.triggerType,
    triggerName: payload.triggerName,
    instructionPath: toModelPath(payload.instructionPath),
    triggerPayload: triggerEventPayload,
    invocationMessage: payload.invocationMessage,
  });

  try {
    await spawnTriggerRun(supabase, {
      runId: payload.currentRunId,
      clientId: payload.clientId,
      threadId: payload.threadId,
      triggerType: payload.triggerType === "webhook" ? "webhook" : "cron",
      invocationMessage: `${triggerEventMessage}\n\n${CRON_RUN_NUDGE}`,
      triggerId: payload.triggerId,
      triggerName: payload.triggerName,
    });

    return finish("queued", { advanceNextFireAt: true });
  } catch (error) {
    if (error instanceof AutomationAlreadyRunningError) {
      console.info("[executor] Trigger skipped because automation is busy", {
        triggerId: payload.triggerId,
        currentRunId: payload.currentRunId,
        triggerType: payload.triggerType,
      });
      return finish("skipped_thread_busy", { advanceNextFireAt: true });
    }

    console.error("[executor] schedule trigger failed:", error);
    return finish(
      hasExhaustedRetries ? "failed_permanent" : "failed",
      { nextFireAt: null, advanceNextFireAt: false },
    );
  }
}
