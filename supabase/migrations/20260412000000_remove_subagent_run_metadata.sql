-- Remove subagent run infrastructure (feature canned).

-- Drop subagent-specific indexes
DROP INDEX IF EXISTS public.idx_runs_parent_run_id;
DROP INDEX IF EXISTS public.idx_runs_root_by_thread;

-- Drop foreign key and self-reference check constraints
ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS runs_parent_run_id_fkey,
  DROP CONSTRAINT IF EXISTS runs_parent_run_not_self;

-- Drop the parent_run_id column
ALTER TABLE public.runs
  DROP COLUMN IF EXISTS parent_run_id;

-- Replace the run_type check constraint without 'subagent'
ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS runs_run_type_check;

ALTER TABLE public.runs
  ADD CONSTRAINT runs_run_type_check
  CHECK (run_type IN ('chat', 'webhook', 'cron', 'autopilot'));

-- Recreate create_run_if_idle without the subagent run type
DROP FUNCTION IF EXISTS public.create_run_if_idle(UUID, UUID, TEXT);

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

  IF p_run_type NOT IN ('chat', 'webhook', 'cron', 'autopilot') THEN
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

COMMENT ON COLUMN public.runs.run_type
IS 'Persisted source of the run: chat, webhook, cron, or autopilot.';
