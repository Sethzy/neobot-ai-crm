/**
 * Writes evaluator scores to Supabase `run_scores`.
 *
 * Replaces the legacy external score-write path for the in-process
 * evaluators (`runEvaluatorsForEvents`). The schema stores the same
 * evaluator name + numeric score + optional comment shape.
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
  const { error } = await supabase.from("run_scores").upsert(
    {
      run_id: runId,
      evaluator_name: score.evaluator_name,
      score_type: score.score_type,
      score_value: score.score_value,
      ...(score.comment !== undefined ? { comment: score.comment } : {}),
    },
    {
      onConflict: "run_id,evaluator_name,score_type",
      ignoreDuplicates: false,
    },
  );
  if (error) {
    throw new Error(`run_scores upsert failed: ${error.message}`);
  }
}
