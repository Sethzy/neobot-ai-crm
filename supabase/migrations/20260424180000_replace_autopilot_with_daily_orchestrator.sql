-- Replace Autopilot Pulse with a normal seeded Daily Orchestrator automation.
-- Keeps database bootstrap focused on guaranteeing the primary Main thread.

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS daily_orchestrator_seeded_at TIMESTAMPTZ;

DELETE FROM public.agent_triggers
WHERE trigger_type = 'pulse';

DROP INDEX IF EXISTS public.idx_agent_triggers_one_pulse_per_client;

ALTER TABLE public.agent_triggers
  DROP CONSTRAINT IF EXISTS agent_triggers_trigger_type_check;

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_trigger_type_check
  CHECK (trigger_type IN ('schedule', 'webhook', 'rss'));

ALTER TABLE public.agent_triggers
  DROP CONSTRAINT IF EXISTS agent_triggers_schedule_fields_check;

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_schedule_fields_check CHECK (
    trigger_type <> 'schedule'
    OR (cron_expression IS NOT NULL AND next_fire_at IS NOT NULL)
  );

UPDATE public.runs
SET run_type = 'cron'
WHERE run_type = 'autopilot';

ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS runs_run_type_check;

ALTER TABLE public.runs
  ADD CONSTRAINT runs_run_type_check
  CHECK (run_type IN ('chat', 'webhook', 'cron'));

DROP TRIGGER IF EXISTS on_client_created_bootstrap_autopilot ON public.clients;
DROP TRIGGER IF EXISTS trg_sync_autopilot_trigger_from_config ON public.autopilot_config;
DROP TRIGGER IF EXISTS trg_autopilot_config_updated_at ON public.autopilot_config;

DROP FUNCTION IF EXISTS public.bootstrap_autopilot() CASCADE;
DROP FUNCTION IF EXISTS public.sync_autopilot_trigger_from_config() CASCADE;
DROP FUNCTION IF EXISTS public.update_autopilot_config_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_autopilot_for_client(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.autopilot_interval_to_cron(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.autopilot_next_fire_at(TEXT, TIMESTAMPTZ) CASCADE;

DROP POLICY IF EXISTS autopilot_config_select_own ON public.autopilot_config;
DROP POLICY IF EXISTS autopilot_config_update_own ON public.autopilot_config;
DROP TABLE IF EXISTS public.autopilot_config CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_main_thread_for_client(p_client_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  SELECT thread_id
  INTO v_thread_id
  FROM public.conversation_threads
  WHERE client_id = p_client_id
    AND is_primary = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    SELECT thread_id
    INTO v_thread_id
    FROM public.conversation_threads
    WHERE client_id = p_client_id
      AND title IN ('Main', 'Agent', 'Sunder Autopilot')
    ORDER BY is_archived ASC, created_at ASC
    LIMIT 1;
  END IF;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.conversation_threads (
      client_id,
      title,
      is_pinned,
      is_primary
    )
    VALUES (
      p_client_id,
      'Main',
      true,
      true
    )
    RETURNING thread_id INTO v_thread_id;
  ELSE
    UPDATE public.conversation_threads
    SET
      is_archived = false,
      is_pinned = true,
      is_primary = true,
      title = 'Main'
    WHERE thread_id = v_thread_id;
  END IF;

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_main_thread_for_client(UUID)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_main_thread_for_client(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.bootstrap_main_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.ensure_main_thread_for_client(NEW.client_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_client_created_bootstrap_main_thread ON public.clients;

CREATE TRIGGER on_client_created_bootstrap_main_thread
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_main_thread();

COMMENT ON FUNCTION public.bootstrap_main_thread()
  IS 'Creates or repairs the pinned primary Main thread for a client.';

SELECT public.ensure_main_thread_for_client(client_id)
FROM public.clients;

COMMIT;
