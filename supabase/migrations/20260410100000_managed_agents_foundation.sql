-- H1: Managed Agents migration foundation.
-- Additive only. No destructive changes. The legacy runner does not read or
-- write any of these columns until H2/H3 wires in the chat adapter.
--
-- Changes:
--   1. runs                  - session_id, events_cursor
--   2. clients               - client_profile, user_preferences
--   3. conversation_threads  - session_id
--   4. conversation_messages - source_event_id + unique partial index
--   5. approval_events       - session_id, tool_use_id
--   6. run_scores            - evaluator output table with RLS

-- 1. runs ---------------------------------------------------------------
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS session_id text;

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS events_cursor text;

COMMENT ON COLUMN public.runs.session_id IS
  'Anthropic Managed Agents session id. Null for legacy runner rows.';
COMMENT ON COLUMN public.runs.events_cursor IS
  'Cursor passed to sessions.events.list({ after }) by the polling cron.';

-- 2. clients ------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_profile text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS user_preferences text;

COMMENT ON COLUMN public.clients.client_profile IS
  'Per-client system prompt injection (replaces SOUL.md). Migrated from Storage in H1.';
COMMENT ON COLUMN public.clients.user_preferences IS
  'Per-client user profile injection (replaces USER.md). Migrated from Storage in H1.';

-- 3. conversation_threads ----------------------------------------------
ALTER TABLE public.conversation_threads
  ADD COLUMN IF NOT EXISTS session_id text;

COMMENT ON COLUMN public.conversation_threads.session_id IS
  'Anthropic Managed Agents session id for this thread.';

-- 4. conversation_messages ---------------------------------------------
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS source_event_id text;

COMMENT ON COLUMN public.conversation_messages.source_event_id IS
  'Anthropic event id this message was derived from. Used for idempotent polling upserts.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_messages_thread_source_event
  ON public.conversation_messages (thread_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

-- 5. approval_events ----------------------------------------------------
ALTER TABLE public.approval_events
  ADD COLUMN IF NOT EXISTS session_id text;

ALTER TABLE public.approval_events
  ADD COLUMN IF NOT EXISTS tool_use_id text;

COMMENT ON COLUMN public.approval_events.session_id IS
  'Anthropic session id used to route approvals back to the correct session.';
COMMENT ON COLUMN public.approval_events.tool_use_id IS
  'Anthropic custom_tool_use event id used for user.tool_confirmation.';

-- 6. run_scores ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.run_scores (
  score_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(run_id) ON DELETE CASCADE,
  evaluator_name text NOT NULL,
  score_type text NOT NULL,
  score_value numeric,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_scores_run_id
  ON public.run_scores (run_id);

ALTER TABLE public.run_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'run_scores'
      AND policyname = 'run_scores_select'
  ) THEN
    CREATE POLICY "run_scores_select"
      ON public.run_scores
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.runs
          WHERE runs.run_id = run_scores.run_id
            AND runs.client_id = public.get_my_client_id()
        )
      );
  END IF;
END
$$;

-- No INSERT/UPDATE/DELETE policies in H1. Evaluator writes happen from
-- the chat adapter / trigger polling cron under service_role, which
-- bypasses RLS. H2 will revisit whether user-auth INSERTs are ever
-- needed; until then, tenant sessions cannot forge evaluator rows.

COMMENT ON TABLE public.run_scores IS
  'In-process evaluator output per run. Replaces Langfuse scores.';
