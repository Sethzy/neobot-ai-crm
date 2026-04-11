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

import { getServerEnv } from "@/lib/env";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { runTriggerAgent } from "@/trigger/run-trigger-agent";
import type { Database } from "@/types/database";

type TriggerRunSupabase = SupabaseClient<Database>;

export interface SpawnTriggerRunInput {
  runId?: string;
  clientId: string;
  threadId: string;
  triggerType: "cron" | "webhook" | "autopilot";
  invocationMessage: string;
}

export interface SpawnTriggerRunResult {
  runId: string;
  sessionId: string;
  taskHandle: { id: string };
}

export async function spawnTriggerRun(
  supabase: TriggerRunSupabase,
  input: SpawnTriggerRunInput,
): Promise<SpawnTriggerRunResult> {
  const env = getServerEnv();
  const anthropic = getAnthropicClient();

  if (
    !env.ANTHROPIC_AGENT_ID ||
    !env.ANTHROPIC_AGENT_VERSION ||
    !env.ANTHROPIC_ENVIRONMENT_ID
  ) {
    throw new Error(
      "Managed agents env vars missing: ANTHROPIC_AGENT_ID / ANTHROPIC_AGENT_VERSION / ANTHROPIC_ENVIRONMENT_ID",
    );
  }

  const runId = input.runId ?? crypto.randomUUID();

  const session = await anthropic.beta.sessions.create({
    agent: {
      type: "agent",
      id: env.ANTHROPIC_AGENT_ID,
      version: Number(env.ANTHROPIC_AGENT_VERSION),
    },
    environment_id: env.ANTHROPIC_ENVIRONMENT_ID,
  } as never);

  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      run_id: runId,
      client_id: input.clientId,
      thread_id: input.threadId,
      run_type: input.triggerType,
      status: "running",
      session_id: session.id,
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
    threadId: input.threadId,
  });

  return {
    runId,
    sessionId: session.id,
    taskHandle: { id: taskHandle.id },
  };
}
