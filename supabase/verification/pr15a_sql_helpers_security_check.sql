-- PR15A verification: assertive checks for SQL helper function safety and ownership.
-- This script intentionally raises exceptions on violations.
-- Run in a safe validation environment after applying PR15A migrations.

BEGIN;

DO $$
DECLARE
  v_client_id UUID;
  v_user_id UUID;
  v_thread_id UUID;
  v_result JSONB;
BEGIN
  SELECT c.client_id, c.user_id
  INTO v_client_id, v_user_id
  FROM public.clients AS c
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_client_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Verification requires at least one client row';
  END IF;

  SELECT t.thread_id
  INTO v_thread_id
  FROM public.conversation_threads AS t
  WHERE t.client_id = v_client_id
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.conversation_threads (client_id, title)
    VALUES (v_client_id, 'PR15A verification thread')
    RETURNING thread_id INTO v_thread_id;
  END IF;

  -- Positive control: SELECT query succeeds.
  PERFORM public.run_readonly_sql('SELECT 1 AS one');

  -- Guard check: non-read-only query must fail.
  BEGIN
    PERFORM public.run_readonly_sql('UPDATE public.conversation_threads SET title = ''x''');
    RAISE EXCEPTION 'Expected run_readonly_sql to reject non-read-only query';
  EXCEPTION
    WHEN OTHERS THEN
      IF position('Only SELECT/CTE queries are allowed' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  -- Guard check: multi-statement SQL must fail.
  BEGIN
    PERFORM public.run_readonly_sql('SELECT 1; SELECT 2');
    RAISE EXCEPTION 'Expected run_readonly_sql to reject multi-statement SQL';
  EXCEPTION
    WHEN OTHERS THEN
      IF position('Only single-statement queries are allowed' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  -- Ownership check for SECURITY DEFINER function:
  -- emulate authenticated user context by setting JWT subject to a known client user.
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  SELECT public.get_system_reminder_context(v_client_id, v_thread_id)
  INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Expected get_system_reminder_context to return owned client context';
  END IF;

  SELECT public.get_system_reminder_context(gen_random_uuid(), v_thread_id)
  INTO v_result;

  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'Expected get_system_reminder_context to reject non-owned client_id';
  END IF;
END
$$;

ROLLBACK;
