-- PR12: Add run step count for basic routing analytics and audit metadata.
-- Decisions: SAFETY-03, SCALE-01.

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS step_count INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.runs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%step_count%'
      AND pg_get_constraintdef(oid) ILIKE '%>= 0%'
  ) THEN
    ALTER TABLE public.runs
      ADD CONSTRAINT runs_step_count_non_negative
      CHECK (step_count IS NULL OR step_count >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.runs.step_count IS 'Number of model/tool loop steps executed in this run.';
