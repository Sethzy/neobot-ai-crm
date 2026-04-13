/**
 * Trigger fire-path helper for Managed Agents background runs.
 *
 * Creates a disposable Anthropic session, persists the already-claimed
 * `runs` row keyed by the trigger claim id, sends the kickoff
 * `user.message`, and hands execution off to the Trigger.dev listener.
 *
 * @module lib/managed-agents/spawn-trigger-run
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";

import { createThread } from "@/lib/chat/threads";
import { getServerEnv } from "@/lib/env";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { resolveAgentRef } from "@/lib/managed-agents/agent-config";
import { runTriggerAgent } from "@/trigger/run-trigger-agent";
import type { Database } from "@/types/database";

type TriggerRunSupabase = SupabaseClient<Database>;

export interface SpawnTriggerRunInput {
  runId?: string;
  clientId: string;
  threadId: string;
  triggerType: "cron" | "webhook" | "autopilot";
  invocationMessage: string;
  /** ID of the parent automation (agent_triggers row). */
  triggerId: string;
  /** Human-readable automation name for thread title generation. */
  triggerName: string;
}

export interface SpawnTriggerRunResult {
  runId: string;
  sessionId: string;
  taskHandle: { id: string };
}

interface CleanupArgs {
  supabase: TriggerRunSupabase;
  runId: string;
  runThreadId?: string;
  sessionId?: string;
  cleanupReason: string;
}

/**
 * Best-effort cleanup for partially created trigger-run artifacts. Setup
 * failures should not leave orphaned run rows, run threads, or idle sessions.
 */
async function cleanupFailedSpawn({
  supabase,
  runId,
  runThreadId,
  sessionId,
  cleanupReason,
}: CleanupArgs): Promise<void> {
  const cleanupTasks: Promise<unknown>[] = [];

  if (sessionId) {
    cleanupTasks.push(
      getAnthropicClient().beta.sessions.archive(sessionId).catch((error) => {
        console.error("[spawnTriggerRun] Failed to archive session during cleanup:", {
          sessionId,
          cleanupReason,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  }

  cleanupTasks.push(
    supabase
      .from("runs")
      .delete()
      .eq("run_id", runId)
      .catch((error) => {
        console.error("[spawnTriggerRun] Failed to delete run during cleanup:", {
          runId,
          cleanupReason,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
  );

  if (runThreadId) {
    cleanupTasks.push(
      supabase
        .from("conversation_threads")
        .delete()
        .eq("thread_id", runThreadId)
        .catch((error) => {
          console.error("[spawnTriggerRun] Failed to delete run thread during cleanup:", {
            runThreadId,
            cleanupReason,
            error: error instanceof Error ? error.message : String(error),
          });
        }),
    );
  }

  await Promise.all(cleanupTasks);
}

export async function spawnTriggerRun(
  supabase: TriggerRunSupabase,
  input: SpawnTriggerRunInput,
): Promise<SpawnTriggerRunResult> {
  const env = getServerEnv();
  const anthropic = getAnthropicClient();

  // Trigger runs default to Sonnet. Per-trigger model selection is future work.
  const ref = resolveAgentRef("anthropic/claude-sonnet-4-6");

  if (!env.ANTHROPIC_ENVIRONMENT_ID) {
    throw new Error(
      "Managed agents env var missing: ANTHROPIC_ENVIRONMENT_ID",
    );
  }

  const runId = input.runId ?? crypto.randomUUID();
  let sessionId: string | undefined;
  let runThreadId: string | undefined;

  try {
    // Create a dedicated thread for this run
    const runThreadTitle = `${input.triggerName} — ${format(new Date(), "MMM d, h:mm a")}`;
    const runThread = await createThread(supabase, input.clientId, runThreadTitle);
    runThreadId = runThread.thread_id;

    const { error: sourceError } = await supabase
      .from("conversation_threads")
      .update({
        source_type: "automation_run",
        source_trigger_id: input.triggerId,
        source_run_id: runId,
      })
      .eq("thread_id", runThread.thread_id);

    if (sourceError) {
      throw new Error(`Failed to set run thread source columns: ${sourceError.message}`);
    }

    const session = await anthropic.beta.sessions.create({
      agent: {
        type: "agent",
        id: ref.agentId,
        version: ref.agentVersion,
      },
      environment_id: env.ANTHROPIC_ENVIRONMENT_ID,
    } as never);
    sessionId = session.id;

    const { data: run, error } = await supabase
      .from("runs")
      .insert({
        run_id: runId,
        client_id: input.clientId,
        thread_id: runThread.thread_id,
        run_type: input.triggerType,
        status: "running",
        session_id: session.id,
        trigger_id: input.triggerId,
        run_thread_id: runThread.thread_id,
      })
      .select("run_id, session_id")
      .single();

    if (error || !run) {
      throw new Error(`Failed to insert runs row: ${error?.message ?? "unknown"}`);
    }

    await anthropic.beta.sessions.events.send(session.id, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: input.invocationMessage }],
        },
      ],
    } as never);

    const taskHandle = await runTriggerAgent.trigger({
      runId,
      sessionId: session.id,
      clientId: input.clientId,
      threadId: runThread.thread_id,
    });

    return {
      runId,
      sessionId: session.id,
      taskHandle: { id: taskHandle.id },
    };
  } catch (error) {
    await cleanupFailedSpawn({
      supabase,
      runId,
      runThreadId,
      sessionId,
      cleanupReason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
