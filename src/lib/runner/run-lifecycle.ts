/**
 * Run lifecycle data access helpers.
 * @module lib/runner/run-lifecycle
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type SupabaseMutationError = { message: string; code?: string | null };

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

function isMissingStepCountColumnError(error: SupabaseMutationError | null): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "42703" || error.code === "PGRST204") {
    return true;
  }

  const normalizedMessage = error.message.toLowerCase();
  return normalizedMessage.includes("step_count") &&
    (normalizedMessage.includes("does not exist") || normalizedMessage.includes("schema cache"));
}

/**
 * Attempts to atomically create a running row for a thread.
 */
export async function createRun(
  supabase: ChatSupabaseClient,
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
  supabase: ChatSupabaseClient,
  { runId, status, model, tokensIn, tokensOut, stepCount }: CompleteRunInput,
): Promise<void> {
  const updatePayload = {
    status,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    completed_at: new Date().toISOString(),
  };

  const { error: primaryError } = await supabase
    .from("runs")
    .update({
      ...updatePayload,
      ...(stepCount !== undefined && { step_count: stepCount }),
    })
    .eq("run_id", runId);

  if (!primaryError) {
    return;
  }

  if (stepCount !== undefined && isMissingStepCountColumnError(primaryError)) {
    const { error: fallbackError } = await supabase
      .from("runs")
      .update(updatePayload)
      .eq("run_id", runId);

    if (!fallbackError) {
      return;
    }

    throw new Error(`Failed to complete run: ${fallbackError.message}`);
  }

  throw new Error(`Failed to complete run: ${primaryError.message}`);
}

/**
 * Fails stale running rows for a thread before lock acquisition.
 */
export async function markStaleRunsFailed(
  supabase: ChatSupabaseClient,
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
