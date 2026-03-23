ALTER TABLE public.runs ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER;
COMMENT ON COLUMN public.runs.prompt_tokens IS 'Input token count from the LLM response, used for fraction-based compaction trigger.';
