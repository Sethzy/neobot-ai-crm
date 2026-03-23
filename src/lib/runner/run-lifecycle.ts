/**
 * Run lifecycle data access helpers.
 * @module lib/runner/run-lifecycle
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RunType } from "@/lib/runner/run-types";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type SupabaseMutationError = { message: string; code?: string | null };
type RunInsert = Database["public"]["Tables"]["runs"]["Insert"];

export interface CreateRunInput {
  threadId: string;
  clientId: string;
  runType: RunType;
}

export type CreateRunResult = { created: true; runId: string } | { created: false };

export interface CreateSubagentRunInput {
  threadId: string;
  clientId: string;
  parentRunId: string;
}

export interface CompleteRunInput {
  runId: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Number of model/tool loop steps executed in this run. */
  stepCount?: number;
  /** Input token count for fraction-based compaction trigger. */
  promptTokens?: number;
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
  { threadId, clientId, runType }: CreateRunInput,
): Promise<CreateRunResult> {
  const { data, error } = await supabase.rpc("create_run_if_idle", {
    p_thread_id: threadId,
    p_client_id: clientId,
    p_run_type: runType,
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
 * Creates a child run row for one subagent execution linked to a parent run.
 */
export async function createSubagentRun(
  supabase: ChatSupabaseClient,
  { threadId, clientId, parentRunId }: CreateSubagentRunInput,
): Promise<{ runId: string }> {
  const insertPayload: RunInsert = {
    thread_id: threadId,
    client_id: clientId,
    parent_run_id: parentRunId,
    run_type: "subagent",
    status: "running",
  };

  const { data, error } = await supabase
    .from("runs")
    .insert(insertPayload)
    .select("run_id")
    .single();

  if (error || !data || typeof data.run_id !== "string") {
    throw new Error(`Failed to create subagent run: ${error?.message ?? "missing run id"}`);
  }

  return { runId: data.run_id };
}

/**
 * Marks a run with terminal status and usage metadata.
 */
export async function completeRun(
  supabase: ChatSupabaseClient,
  { runId, status, model, tokensIn, tokensOut, stepCount, promptTokens }: CompleteRunInput,
): Promise<void> {
  const updatePayload = {
    status,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    completed_at: new Date().toISOString(),
    ...(promptTokens !== undefined && { prompt_tokens: promptTokens }),
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
