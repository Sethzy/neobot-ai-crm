-- Add an atomic Daily Orchestrator seed RPC for authenticated bootstrap routes.

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_default_daily_orchestrator(
  p_client_id UUID,
  p_thread_id UUID,
  p_name TEXT,
  p_instruction_path TEXT,
  p_invocation_message TEXT,
  p_cron_expression TEXT,
  p_payload JSONB,
  p_next_fire_at TIMESTAMPTZ
)
RETURNS TABLE (
  trigger_id UUID,
  seeded BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seeded_at TIMESTAMPTZ;
  v_trigger_id UUID;
BEGIN
  SELECT daily_orchestrator_seeded_at
  INTO v_seeded_at
  FROM public.clients
  WHERE client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client % not found', p_client_id;
  END IF;

  IF v_seeded_at IS NOT NULL THEN
    RETURN QUERY
    SELECT NULL::UUID, false;
    RETURN;
  END IF;

  SELECT id
  INTO v_trigger_id
  FROM public.agent_triggers
  WHERE client_id = p_client_id
    AND instruction_path = p_instruction_path
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_trigger_id IS NULL THEN
    INSERT INTO public.agent_triggers (
      client_id,
      thread_id,
      trigger_type,
      name,
      instruction_path,
      invocation_message,
      cron_expression,
      enabled,
      next_fire_at,
      payload,
      retry_count,
      webhook_secret
    )
    VALUES (
      p_client_id,
      p_thread_id,
      'schedule',
      p_name,
      p_instruction_path,
      p_invocation_message,
      p_cron_expression,
      true,
      p_next_fire_at,
      p_payload,
      0,
      NULL
    )
    RETURNING id INTO v_trigger_id;
  ELSE
    UPDATE public.agent_triggers
    SET
      thread_id = p_thread_id,
      name = p_name,
      invocation_message = p_invocation_message,
      cron_expression = p_cron_expression,
      enabled = true,
      next_fire_at = p_next_fire_at,
      payload = p_payload,
      retry_count = 0
    WHERE id = v_trigger_id;
  END IF;

  UPDATE public.clients
  SET daily_orchestrator_seeded_at = NOW()
  WHERE client_id = p_client_id;

  RETURN QUERY
  SELECT v_trigger_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_daily_orchestrator(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_daily_orchestrator(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.seed_default_daily_orchestrator(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  TIMESTAMPTZ
)
  IS 'Atomically seeds the default Daily Orchestrator trigger once per client.';

COMMIT;
