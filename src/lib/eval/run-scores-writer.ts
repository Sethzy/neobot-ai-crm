/**
 * Writes evaluator scores to Supabase `run_scores`.
 *
 * Replaces the legacy Langfuse `createScore` path for the in-process
 * evaluators (`runEvaluatorsForEvents`). The schema mirrors the original
 * Langfuse score shape: evaluator name + numeric score + optional comment.
 *
 * @module lib/eval/run-scores-writer
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export interface RunScorePayload {
  evaluator_name: string;
  score_type: string;
  score_value: number;
  comment?: string;
}

export async function writeRunScore(
  supabase: SupabaseClient<Database>,
  runId: string,
  score: RunScorePayload,
): Promise<void> {
  const { error } = await supabase.from("run_scores").insert({
    run_id: runId,
    evaluator_name: score.evaluator_name,
    score_type: score.score_type,
    score_value: score.score_value,
    ...(score.comment !== undefined ? { comment: score.comment } : {}),
  });
  if (error) {
    throw new Error(`run_scores insert failed: ${error.message}`);
  }
}
