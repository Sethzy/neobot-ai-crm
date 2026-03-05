-- PR 19: bootstrap the built-in autopilot thread, pulse trigger, and config.
-- Decision refs: TRIG-07, TRIG-09, TRIG-10.

CREATE OR REPLACE FUNCTION public.autopilot_interval_to_cron(p_pulse_interval TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  CASE p_pulse_interval
    WHEN '1h' THEN
      RETURN '0 * * * *';
    WHEN '2h' THEN
      RETURN '0 */2 * * *';
    WHEN '6h' THEN
      RETURN '0 */6 * * *';
    WHEN '12h' THEN
      RETURN '0 */12 * * *';
    ELSE
      RAISE EXCEPTION 'Unsupported autopilot pulse interval: %', p_pulse_interval;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.autopilot_next_fire_at(
  p_pulse_interval TEXT,
  p_reference TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_interval INTERVAL;
BEGIN
  v_interval = CASE p_pulse_interval
    WHEN '1h' THEN INTERVAL '1 hour'
    WHEN '2h' THEN INTERVAL '2 hours'
    WHEN '6h' THEN INTERVAL '6 hours'
    WHEN '12h' THEN INTERVAL '12 hours'
    ELSE NULL
  END;

  IF v_interval IS NULL THEN
    RAISE EXCEPTION 'Unsupported autopilot pulse interval: %', p_pulse_interval;
  END IF;

  RETURN date_bin(
    v_interval,
    p_reference,
    '2000-01-01 00:00:00+00'::timestamptz
  ) + v_interval;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_autopilot_for_client(p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_thread_id UUID;
  v_trigger_id UUID;
  v_pulse_interval TEXT;
  v_enabled BOOLEAN;
BEGIN
  INSERT INTO public.autopilot_config (client_id)
  VALUES (p_client_id)
  ON CONFLICT (client_id) DO NOTHING;

  SELECT pulse_interval, enabled
  INTO v_pulse_interval, v_enabled
  FROM public.autopilot_config
  WHERE client_id = p_client_id;

  SELECT thread_id
  INTO v_thread_id
  FROM public.agent_triggers
  WHERE client_id = p_client_id
    AND trigger_type = 'pulse'
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    SELECT thread_id
    INTO v_thread_id
    FROM public.conversation_threads
    WHERE client_id = p_client_id
      AND title = 'Sunder Autopilot'
    ORDER BY is_archived ASC, created_at ASC
    LIMIT 1;
  END IF;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.conversation_threads (client_id, title, is_pinned)
    VALUES (p_client_id, 'Sunder Autopilot', true)
    RETURNING thread_id INTO v_thread_id;
  ELSE
    UPDATE public.conversation_threads
    SET
      is_archived = false,
      is_pinned = true,
      title = COALESCE(title, 'Sunder Autopilot')
    WHERE thread_id = v_thread_id;
  END IF;

  SELECT id
  INTO v_trigger_id
  FROM public.agent_triggers
  WHERE client_id = p_client_id
    AND trigger_type = 'pulse'
  LIMIT 1;

  IF v_trigger_id IS NULL THEN
    INSERT INTO public.agent_triggers (
      client_id,
      thread_id,
      trigger_type,
      name,
      cron_expression,
      instruction_path,
      enabled,
      next_fire_at
    ) VALUES (
      p_client_id,
      v_thread_id,
      'pulse',
      'Autopilot Pulse',
      public.autopilot_interval_to_cron(v_pulse_interval),
      'autopilot/pulse',
      v_enabled,
      public.autopilot_next_fire_at(v_pulse_interval, now())
    );
  ELSE
    UPDATE public.agent_triggers
    SET
      thread_id = v_thread_id,
      name = 'Autopilot Pulse',
      cron_expression = public.autopilot_interval_to_cron(v_pulse_interval),
      instruction_path = 'autopilot/pulse',
      enabled = v_enabled,
      next_fire_at = CASE
        WHEN current_run_id IS NULL
          THEN public.autopilot_next_fire_at(v_pulse_interval, now())
        ELSE next_fire_at
      END
    WHERE id = v_trigger_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_autopilot_trigger_from_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_triggers
  SET
    cron_expression = public.autopilot_interval_to_cron(NEW.pulse_interval),
    enabled = NEW.enabled,
    next_fire_at = CASE
      WHEN current_run_id IS NOT NULL THEN next_fire_at
      WHEN TG_OP = 'INSERT'
        OR NEW.pulse_interval IS DISTINCT FROM COALESCE(OLD.pulse_interval, NEW.pulse_interval)
        OR NEW.enabled IS DISTINCT FROM COALESCE(OLD.enabled, NEW.enabled)
        THEN public.autopilot_next_fire_at(NEW.pulse_interval, now())
      ELSE next_fire_at
    END
  WHERE client_id = NEW.client_id
    AND trigger_type = 'pulse';

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_autopilot_trigger_from_config
  AFTER INSERT OR UPDATE ON public.autopilot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_autopilot_trigger_from_config();

CREATE OR REPLACE FUNCTION public.bootstrap_autopilot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.ensure_autopilot_for_client(NEW.client_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_client_created_bootstrap_autopilot
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_autopilot();

COMMENT ON FUNCTION public.bootstrap_autopilot()
  IS 'Creates or repairs the built-in autopilot thread, pulse trigger, and config for a client.';

SELECT public.ensure_autopilot_for_client(client_id)
FROM public.clients;
