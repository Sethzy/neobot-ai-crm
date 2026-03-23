ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS context_reset_at TIMESTAMPTZ;
COMMENT ON COLUMN public.conversation_threads.context_reset_at IS 'When set, context assembly only loads messages after this timestamp. Set automatically when a thread is stale (4h idle). User still sees full history in UI.';
