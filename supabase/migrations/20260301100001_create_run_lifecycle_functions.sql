-- PR4: SQL functions for thread run locking, stale cleanup, and atomic queue drain.

-- Atomically create a running row only when thread has no running row.
CREATE OR REPLACE FUNCTION public.create_run_if_idle(
  p_thread_id UUID,
  p_client_id UUID
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

  INSERT INTO public.runs (run_id, thread_id, client_id, status)
  SELECT gen_random_uuid(), p_thread_id, p_client_id, 'running'
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

COMMENT ON FUNCTION public.create_run_if_idle(UUID, UUID)
IS 'Creates a running row only when thread has no active running row.';

-- Fail stale running rows older than N minutes.
CREATE OR REPLACE FUNCTION public.mark_stale_runs_failed(
  p_thread_id UUID DEFAULT NULL,
  p_stale_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_client_id UUID;
  v_count INTEGER;
BEGIN
  SELECT clients.client_id
  INTO v_auth_client_id
  FROM public.clients AS clients
  WHERE clients.user_id = auth.uid()
  LIMIT 1;

  UPDATE public.runs
  SET status = 'failed',
      completed_at = now()
  WHERE status = 'running'
    AND created_at < now() - make_interval(mins => p_stale_minutes)
    AND (p_thread_id IS NULL OR thread_id = p_thread_id)
    AND (v_auth_client_id IS NULL OR client_id = v_auth_client_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.mark_stale_runs_failed(UUID, INTEGER)
IS 'Marks stale running rows failed, scoped by thread and/or authenticated client.';

-- Atomically fetch+delete queued rows for a thread/client pair.
CREATE OR REPLACE FUNCTION public.drain_thread_queue(
  p_thread_id UUID,
  p_client_id UUID
)
RETURNS TABLE (
  queue_id UUID,
  content JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_client_id UUID;
BEGIN
  SELECT clients.client_id
  INTO v_auth_client_id
  FROM public.clients AS clients
  WHERE clients.user_id = auth.uid()
  LIMIT 1;

  IF auth.uid() IS NOT NULL AND v_auth_client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Cannot drain queue for another client';
  END IF;

  RETURN QUERY
  WITH locked AS (
    SELECT
      records.queue_id,
      records.content,
      records.created_at
    FROM public.thread_queue_records AS records
    WHERE records.thread_id = p_thread_id
      AND records.client_id = p_client_id
    ORDER BY records.created_at
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM public.thread_queue_records AS records
    USING locked
    WHERE records.queue_id = locked.queue_id
    RETURNING locked.queue_id, locked.content, locked.created_at
  )
  SELECT deleted.queue_id, deleted.content, deleted.created_at
  FROM deleted
  ORDER BY deleted.created_at;
END;
$$;

COMMENT ON FUNCTION public.drain_thread_queue(UUID, UUID)
IS 'Atomically drains queue rows for a thread/client pair and returns drained payloads.';
