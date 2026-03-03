-- PR12: Add run step count for basic routing analytics and audit metadata.
-- Decisions: SAFETY-03, SCALE-01.

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS step_count INTEGER CHECK (step_count IS NULL OR step_count >= 0);

COMMENT ON COLUMN public.runs.step_count IS 'Number of model/tool loop steps executed in this run.';
