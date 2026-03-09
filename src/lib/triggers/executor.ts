/**
 * Trigger execution logic for cron-dispatched agent runs.
 * @module lib/triggers/executor
 */
import { createMessage } from "@/lib/chat/messages";
import { runAgent } from "@/lib/runner/run-agent";
import { runAutopilot } from "@/lib/runner/run-autopilot";
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
      const runResult = await runAutopilot({
        clientId: payload.clientId,
        threadId: payload.threadId,
        supabase,
      });

      if (runResult.status === "skipped_busy") {
        await releaseClaim(supabase, payload, "skipped_thread_busy", {
          advanceNextFireAt: true,
        });
        return { status: "skipped_busy" };
      }

      if (runResult.status === "failed") {
        await releaseClaim(supabase, payload, "failed", {
          advanceNextFireAt: true,
        });
        return { status: "failed" };
      }

      await releaseClaim(supabase, payload, "completed", {
        advanceNextFireAt: true,
      });
      return { status: "completed" };
    } catch (error) {
      console.error("[executor] pulse trigger failed:", error);
      await releaseClaim(supabase, payload, "failed", {
        advanceNextFireAt: true,
      });
      return { status: "failed" };
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
        await releaseClaim(supabase, payload, "completed", {
          advanceNextFireAt: true,
        });
        return { status: "completed" };
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
      await releaseClaim(
        supabase,
        payload,
        hasExhaustedRetries ? "failed_permanent" : "failed",
        {
          nextFireAt: null,
          advanceNextFireAt: false,
        },
      );
      return { status: "failed" };
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

  await createMessage(supabase, {
    thread_id: payload.threadId,
    role: "system",
    content: triggerEventMessage,
  });

  try {
    const runResult = await runAgent(
      {
        clientId: payload.clientId,
        threadId: payload.threadId,
        triggerType: "cron",
        input: CRON_RUN_NUDGE,
      },
      supabase,
    );

    if (runResult.status === "queued") {
      await releaseClaim(supabase, payload, "queued", {
        advanceNextFireAt: true,
      });
      return { status: "queued" };
    }

    await releaseClaim(supabase, payload, "completed", {
      advanceNextFireAt: true,
    });
    return { status: "completed" };
  } catch (error) {
    console.error("[executor] schedule trigger failed:", error);
    await releaseClaim(
      supabase,
      payload,
      hasExhaustedRetries ? "failed_permanent" : "failed",
      {
        nextFireAt: null,
        advanceNextFireAt: false,
      },
    );
    return { status: "failed" };
  }
}
