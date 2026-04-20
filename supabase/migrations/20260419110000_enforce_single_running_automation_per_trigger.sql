BEGIN;

WITH ranked_running_runs AS (
  SELECT
    runs.run_id,
    ROW_NUMBER() OVER (
      PARTITION BY runs.trigger_id
      ORDER BY
        CASE
          WHEN agent_triggers.current_run_id = runs.run_id THEN 0
          ELSE 1
        END,
        runs.created_at DESC,
        runs.run_id DESC
    ) AS running_rank
  FROM public.runs AS runs
  LEFT JOIN public.agent_triggers AS agent_triggers
    ON agent_triggers.id = runs.trigger_id
  WHERE runs.trigger_id IS NOT NULL
    AND runs.status = 'running'
),
duplicate_running_runs AS (
  SELECT run_id
  FROM ranked_running_runs
  WHERE running_rank > 1
)
UPDATE public.runs AS runs
SET
  status = 'failed',
  completed_at = COALESCE(completed_at, now())
WHERE runs.run_id IN (SELECT run_id FROM duplicate_running_runs);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_running_automation_per_trigger
  ON public.runs(trigger_id)
  WHERE trigger_id IS NOT NULL AND status = 'running';

COMMIT;
