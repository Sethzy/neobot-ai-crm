-- Forward migration: update ensure_autopilot_for_client to create primary
-- threads with is_primary = true and title = 'Agent'.
-- This replaces the function originally defined in 20260306030002 which
-- used 'Sunder Autopilot' and did not set is_primary.

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
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'ensure_autopilot_for_client is restricted to service_role';
  END IF;

  INSERT INTO public.autopilot_config (client_id)
  VALUES (p_client_id)
  ON CONFLICT (client_id) DO NOTHING;

  SELECT pulse_interval, enabled
  INTO v_pulse_interval, v_enabled
  FROM public.autopilot_config
  WHERE client_id = p_client_id;

  -- Look up existing primary thread first (covers already-migrated clients).
  SELECT thread_id
  INTO v_thread_id
  FROM public.conversation_threads
  WHERE client_id = p_client_id
    AND is_primary = true
  LIMIT 1;

  -- Fall back to pulse trigger linkage.
  IF v_thread_id IS NULL THEN
    SELECT thread_id
    INTO v_thread_id
    FROM public.agent_triggers
    WHERE client_id = p_client_id
      AND trigger_type = 'pulse'
    LIMIT 1;
  END IF;

  -- Fall back to legacy title match.
  IF v_thread_id IS NULL THEN
    SELECT thread_id
    INTO v_thread_id
    FROM public.conversation_threads
    WHERE client_id = p_client_id
      AND (title = 'Agent' OR title = 'Sunder Autopilot')
    ORDER BY is_archived ASC, created_at ASC
    LIMIT 1;
  END IF;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.conversation_threads (client_id, title, is_pinned, is_primary)
    VALUES (p_client_id, 'Agent', true, true)
    RETURNING thread_id INTO v_thread_id;
  ELSE
    UPDATE public.conversation_threads
    SET
      is_archived = false,
      is_pinned = true,
      is_primary = true,
      title = 'Agent'
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
