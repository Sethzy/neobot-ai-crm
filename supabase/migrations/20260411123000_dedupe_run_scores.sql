-- Deduplicate evaluator rows per run before enforcing idempotent writes.
--
-- Managed-agent retries can replay the same evaluator writes. Keep the newest
-- row for each `(run_id, evaluator_name, score_type)` tuple, then enforce that
-- uniqueness at the schema level so future writes can use `upsert`.

WITH ranked_run_scores AS (
  SELECT
    score_id,
    ROW_NUMBER() OVER (
      PARTITION BY run_id, evaluator_name, score_type
      ORDER BY created_at DESC, score_id DESC
    ) AS duplicate_rank
  FROM public.run_scores
)
DELETE FROM public.run_scores
USING ranked_run_scores
WHERE public.run_scores.score_id = ranked_run_scores.score_id
  AND ranked_run_scores.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_run_scores_run_evaluator_type
  ON public.run_scores (run_id, evaluator_name, score_type);
