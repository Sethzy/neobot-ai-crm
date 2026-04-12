/**
 * POST handler for manually triggering an automation run.
 * Skips the scanner claim/release cycle — manual runs are out-of-band.
 * @module api/automations/[triggerId]/run
 */
import { NextResponse } from "next/server";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { spawnTriggerRun } from "@/lib/managed-agents/spawn-trigger-run";
import { toModelPath } from "@/lib/storage/agent-paths";
import { CRON_RUN_NUDGE } from "@/lib/triggers/schemas";
import { buildTriggerEventMessage } from "@/lib/triggers/trigger-event";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ triggerId: string }> },
) {
  const { triggerId } = await params;
  const authResult = await authenticateRequest();

  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase } = authResult;

  // 1. Fetch trigger row (RLS enforces ownership)
  const { data: trigger, error: triggerError } = await supabase
    .from("agent_triggers")
    .select("*")
    .eq("id", triggerId)
    .single();

  if (triggerError || !trigger) {
    return jsonError("Trigger not found", 404);
  }

  // 2. Guard: reject if a run is already in progress
  const { data: activeRuns } = await supabase
    .from("runs")
    .select("run_id")
    .eq("trigger_id", triggerId)
    .eq("status", "running")
    .limit(1);

  if (activeRuns && activeRuns.length > 0) {
    return jsonError("A run is already in progress for this automation", 409);
  }

  // 3. Build trigger event message
  const triggerEventMessage = buildTriggerEventMessage({
    triggerId: trigger.id,
    triggerType: trigger.trigger_type as "schedule" | "webhook" | "rss",
    triggerName: trigger.name ?? "Manual Run",
    instructionPath: trigger.instruction_path
      ? toModelPath(trigger.instruction_path)
      : "/agent/triggers/unknown.md",
    triggerPayload: (trigger.payload as Record<string, unknown>) ?? {},
    invocationMessage: trigger.invocation_message,
  });

  // 4. Spawn the run (creates thread, session, runs row, queues task)
  try {
    const result = await spawnTriggerRun(supabase, {
      clientId: trigger.client_id,
      threadId: trigger.thread_id,
      triggerType: "cron",
      invocationMessage: `${triggerEventMessage}\n\n${CRON_RUN_NUDGE}`,
      triggerId: trigger.id,
      triggerName: trigger.name ?? "Automation",
    });

    return NextResponse.json({
      runId: result.runId,
      sessionId: result.sessionId,
    });
  } catch (error) {
    console.error("[manual-run] Failed to spawn run:", error);
    return jsonError("Failed to start run", 500);
  }
}
