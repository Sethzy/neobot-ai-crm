-- PR29: Persist run lineage and source metadata for subagents and autopilot.

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS parent_run_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.runs'::regclass
      AND conname = 'runs_run_type_check'
  ) THEN
    ALTER TABLE public.runs
      ADD CONSTRAINT runs_run_type_check
      CHECK (run_type IN ('chat', 'webhook', 'cron', 'autopilot', 'subagent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.runs'::regclass
      AND conname = 'runs_parent_run_not_self'
  ) THEN
    ALTER TABLE public.runs
      ADD CONSTRAINT runs_parent_run_not_self
      CHECK (parent_run_id IS NULL OR parent_run_id <> run_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.runs'::regclass
      AND conname = 'runs_parent_run_id_fkey'
  ) THEN
    ALTER TABLE public.runs
      ADD CONSTRAINT runs_parent_run_id_fkey
      FOREIGN KEY (parent_run_id)
      REFERENCES public.runs(run_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_runs_run_type
  ON public.runs(run_type);

CREATE INDEX IF NOT EXISTS idx_runs_parent_run_id
  ON public.runs(parent_run_id)
  WHERE parent_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_runs_root_by_thread
  ON public.runs(thread_id, created_at DESC)
  WHERE parent_run_id IS NULL;

COMMENT ON COLUMN public.runs.run_type
IS 'Persisted source of the run: chat, webhook, cron, autopilot, or subagent.';

COMMENT ON COLUMN public.runs.parent_run_id
IS 'Optional parent run for child work such as subagents.';

DROP FUNCTION IF EXISTS public.create_run_if_idle(UUID, UUID);

CREATE OR REPLACE FUNCTION public.create_run_if_idle(
  p_thread_id UUID,
  p_client_id UUID,
  p_run_type TEXT DEFAULT 'chat'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_client_id UUID;
  v_thread_client_id UUID;
  v_run_id UUID;
BEGIN
  SELECT clients.client_id
  INTO v_auth_client_id
  FROM public.clients AS clients
  WHERE clients.user_id = auth.uid()
  LIMIT 1;

  SELECT threads.client_id
  INTO v_thread_client_id
  FROM public.conversation_threads AS threads
  WHERE threads.thread_id = p_thread_id
  LIMIT 1;

  IF v_thread_client_id IS NULL OR v_thread_client_id <> p_client_id THEN
    RAISE EXCEPTION 'Thread does not belong to provided client';
  END IF;

  IF auth.uid() IS NOT NULL AND v_auth_client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Cannot create run for another client';
  END IF;

  IF p_run_type NOT IN ('chat', 'webhook', 'cron', 'autopilot', 'subagent') THEN
    RAISE EXCEPTION 'Unsupported run type: %', p_run_type;
  END IF;

  INSERT INTO public.runs (run_id, thread_id, client_id, status, run_type)
  SELECT gen_random_uuid(), p_thread_id, p_client_id, 'running', p_run_type
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.runs
    WHERE thread_id = p_thread_id
      AND status = 'running'
  )
  RETURNING run_id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.create_run_if_idle(UUID, UUID, TEXT)
IS 'Creates a running row only when thread has no active running row and persists the claimed run type.';
