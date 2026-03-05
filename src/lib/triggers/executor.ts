/**
 * Trigger execution logic for cron-dispatched agent runs.
 * @module lib/triggers/executor
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createMessage } from "@/lib/chat/messages";
import { runAgent } from "@/lib/runner/run-agent";
import { runAutopilot } from "@/lib/runner/run-autopilot";
import type { Database } from "@/types/database";

import type { TriggerDispatchPayload } from "./schemas";

type TriggerSupabaseClient = SupabaseClient<Database>;

const CRON_RUN_NUDGE = "Process the most recent trigger event for this thread.";

export interface ExecuteTriggerInput {
  supabase: TriggerSupabaseClient;
  payload: TriggerDispatchPayload;
}

export interface ExecuteTriggerResult {
  status: "completed" | "failed" | "claim_mismatch" | "queued" | "skipped_busy";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildTriggerEventMessage(payload: TriggerDispatchPayload): string {
  const serializedPayload = JSON.stringify(payload.triggerPayload);
  const firedAt = new Date().toISOString();

  return [
    "<trigger-event>",
    `trigger_instance_id: ${payload.triggerId}`,
    `trigger_type: ${payload.triggerType}`,
    `fired_at: ${firedAt}`,
    `trigger_name: ${escapeXml(payload.triggerName)}`,
    `instruction_path: ${escapeXml(payload.instructionPath)}`,
    `payload: ${escapeXml(serializedPayload)}`,
    "</trigger-event>",
  ].join("\n");
}

async function releaseClaim(
  supabase: TriggerSupabaseClient,
  payload: TriggerDispatchPayload,
  status: ExecuteTriggerResult["status"] | "completed" | "skipped_thread_busy",
): Promise<void> {
  const { data, error } = await supabase.rpc("release_trigger_claim", {
    p_next_fire_at: payload.nextFireAt ?? null,
    p_trigger_id: payload.triggerId,
    p_run_id: payload.currentRunId,
    p_status: status,
  });

  if (error) {
    throw new Error(`Failed to release trigger claim: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Failed to release trigger claim for ${payload.triggerId}.`);
  }
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
    .select("id, current_run_id")
    .eq("id", payload.triggerId)
    .single();

  if (error) {
    throw new Error(`Failed to load trigger claim: ${error.message}`);
  }

  if (!trigger || trigger.current_run_id !== payload.currentRunId) {
    return { status: "claim_mismatch" };
  }

  if (payload.triggerType === "pulse") {
    try {
      const runResult = await runAutopilot({
        clientId: payload.clientId,
        threadId: payload.threadId,
        supabase,
      });

      if (runResult.status === "skipped_busy") {
        await releaseClaim(supabase, payload, "skipped_thread_busy");
        return { status: "skipped_busy" };
      }

      if (runResult.status === "failed") {
        await releaseClaim(supabase, payload, "failed");
        return { status: "failed" };
      }

      await releaseClaim(supabase, payload, "completed");
      return { status: "completed" };
    } catch {
      await releaseClaim(supabase, payload, "failed");
      return { status: "failed" };
    }
  }

  const triggerEventMessage = buildTriggerEventMessage(payload);

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
      await releaseClaim(supabase, payload, "queued");
      return { status: "queued" };
    }

    await releaseClaim(supabase, payload, "completed");
    return { status: "completed" };
  } catch {
    await releaseClaim(supabase, payload, "failed");
    return { status: "failed" };
  }
}
