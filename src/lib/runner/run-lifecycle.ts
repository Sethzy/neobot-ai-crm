/**
 * Run lifecycle data access helpers.
 * @module lib/runner/run-lifecycle
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";

export interface CreateRunInput {
  threadId: string;
  clientId: string;
}

export type CreateRunResult = { created: true; runId: string } | { created: false };

export interface CompleteRunInput {
  runId: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Number of model/tool loop steps executed in this run. */
  stepCount?: number;
}

export interface MarkStaleRunsInput {
  threadId: string;
  staleMinutes?: number;
}

/**
 * Attempts to atomically create a running row for a thread.
 */
export async function createRun(
  supabase: AppSupabaseClient,
  { threadId, clientId }: CreateRunInput,
): Promise<CreateRunResult> {
  const { data, error } = await supabase.rpc("create_run_if_idle", {
    p_thread_id: threadId,
    p_client_id: clientId,
  });

  if (error) {
    throw new Error(`Failed to create run: ${error.message}`);
  }

  if (!data) {
    return { created: false };
  }

  return { created: true, runId: String(data) };
}

/**
 * Marks a run with terminal status and usage metadata.
 */
export async function completeRun(
  supabase: AppSupabaseClient,
  { runId, status, model, tokensIn, tokensOut, stepCount }: CompleteRunInput,
): Promise<void> {
  const { error } = await supabase
    .from("runs")
    .update({
      status,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      completed_at: new Date().toISOString(),
      ...(stepCount !== undefined && { step_count: stepCount }),
    })
    .eq("run_id", runId);

  if (error) {
    throw new Error(`Failed to complete run: ${error.message}`);
  }
}

/**
 * Fails stale running rows for a thread before lock acquisition.
 */
export async function markStaleRunsFailed(
  supabase: AppSupabaseClient,
  { threadId, staleMinutes = 15 }: MarkStaleRunsInput,
): Promise<number> {
  const { data, error } = await supabase.rpc("mark_stale_runs_failed", {
    p_thread_id: threadId,
    p_stale_minutes: staleMinutes,
  });

  if (error) {
    throw new Error(`Failed to mark stale runs: ${error.message}`);
  }

  return Number(data ?? 0);
}
