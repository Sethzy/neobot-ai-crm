/**
 * Run lifecycle data access helpers.
 * @module lib/runner/run-lifecycle
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RunType } from "@/lib/runner/run-types";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type RunInsert = Database["public"]["Tables"]["runs"]["Insert"];

export interface CreateRunInput {
  threadId: string;
  clientId: string;
  runType: RunType;
}

export interface CreateRunRecordInput extends CreateRunInput {
  runId?: string;
  sessionId?: string | null;
  /** Anthropic model ID — set at creation so the approval-resume path can
   *  read it back without guessing which model the session was started with. */
  model?: string;
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
  /** Estimated run cost in USD, computed from per-token pricing. */
  costUsd?: number;
  /** Number of input tokens served from prompt cache. */
  cacheReadTokens?: number;
}

export interface MarkStaleRunsInput {
  threadId: string;
  staleMinutes?: number;
}

/**
 * Inserts a running observability row without the idle-lock RPC.
 *
 * This is used by the send+stream split where multiple user messages can
 * legitimately be in flight on one thread at the same time.
 */
export async function createRunRecord(
  supabase: ChatSupabaseClient,
  input: CreateRunRecordInput,
): Promise<string> {
  const payload: RunInsert = {
    ...(input.runId ? { run_id: input.runId } : {}),
    client_id: input.clientId,
    thread_id: input.threadId,
    run_type: input.runType,
    status: "running",
    ...(input.sessionId !== undefined ? { session_id: input.sessionId } : {}),
    ...(input.model ? { model: input.model } : {}),
  };

  const { data, error } = await supabase
    .from("runs")
    .insert(payload)
    .select("run_id")
    .single();

  if (error || !data?.run_id) {
    throw new Error(error?.message ?? "Failed to create run record");
  }

  return data.run_id;
}

/**
 * Marks a run with terminal status and usage metadata.
 */
export async function completeRun(
  supabase: ChatSupabaseClient,
  { runId, status, model, tokensIn, tokensOut, stepCount, promptTokens, costUsd, cacheReadTokens }: CompleteRunInput,
): Promise<void> {
  const { error } = await supabase
    .from("runs")
    .update({
      status,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      completed_at: new Date().toISOString(),
      ...(promptTokens !== undefined && { prompt_tokens: promptTokens }),
      ...(stepCount !== undefined && { step_count: stepCount }),
      ...(costUsd !== undefined && { cost_usd: costUsd }),
      ...(cacheReadTokens !== undefined && { cache_read_tokens: cacheReadTokens }),
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
