-- PR 19 verification: autopilot bootstrap, config, and pulse invariants.
-- Run after a local reset that includes at least one client row.

SELECT
  c.client_id,
  ac.config_id,
  ac.pulse_interval,
  ac.enabled,
  ac.quiet_hours_start,
  ac.quiet_hours_end
FROM public.clients AS c
LEFT JOIN public.autopilot_config AS ac
  ON ac.client_id = c.client_id
ORDER BY c.created_at;

SELECT
  c.client_id,
  ct.thread_id,
  ct.title,
  ct.is_pinned,
  at.id AS trigger_id,
  at.trigger_type,
  at.name,
  at.cron_expression,
  at.enabled,
  at.next_fire_at
FROM public.clients AS c
LEFT JOIN public.agent_triggers AS at
  ON at.client_id = c.client_id
 AND at.trigger_type = 'pulse'
LEFT JOIN public.conversation_threads AS ct
  ON ct.thread_id = at.thread_id
ORDER BY c.created_at;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'agent_triggers'
  AND indexname = 'idx_agent_triggers_one_pulse_per_client';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.agent_triggers'::regclass
  AND conname IN (
    'agent_triggers_trigger_type_check',
    'agent_triggers_schedule_fields_check'
  )
ORDER BY conname;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.clients AS c
    LEFT JOIN public.autopilot_config AS ac
      ON ac.client_id = c.client_id
    WHERE ac.config_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Some clients are missing autopilot_config rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clients AS c
    LEFT JOIN public.agent_triggers AS at
      ON at.client_id = c.client_id
     AND at.trigger_type = 'pulse'
    WHERE at.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Some clients are missing pulse trigger rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clients AS c
    LEFT JOIN public.agent_triggers AS at
      ON at.client_id = c.client_id
     AND at.trigger_type = 'pulse'
    LEFT JOIN public.conversation_threads AS ct
      ON ct.thread_id = at.thread_id
    WHERE ct.thread_id IS NULL
       OR ct.is_pinned IS NOT TRUE
       OR ct.title <> 'Sunder Autopilot'
  ) THEN
    RAISE EXCEPTION 'Some clients are missing the pinned Sunder Autopilot thread';
  END IF;

  IF to_regprocedure('public.autopilot_interval_to_cron(text)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.autopilot_interval_to_cron(text)';
  END IF;

  IF to_regprocedure('public.autopilot_next_fire_at(text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.autopilot_next_fire_at(text,timestamptz)';
  END IF;

  IF to_regprocedure('public.ensure_autopilot_for_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.ensure_autopilot_for_client(uuid)';
  END IF;
END
$$;

BEGIN;

DO $$
DECLARE
  v_client_id UUID;
  v_cron_expression TEXT;
  v_enabled BOOLEAN;
  v_next_fire_at TIMESTAMPTZ;
BEGIN
  SELECT client_id
  INTO v_client_id
  FROM public.clients
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE NOTICE 'Skipping config-sync verification because no clients exist.';
    RETURN;
  END IF;

  UPDATE public.autopilot_config
  SET
    pulse_interval = '12h',
    enabled = false
  WHERE client_id = v_client_id;

  SELECT cron_expression, enabled, next_fire_at
  INTO v_cron_expression, v_enabled, v_next_fire_at
  FROM public.agent_triggers
  WHERE client_id = v_client_id
    AND trigger_type = 'pulse';

  IF v_cron_expression <> '0 */12 * * *' THEN
    RAISE EXCEPTION 'autopilot_config pulse_interval did not sync to cron_expression';
  END IF;

  IF v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'autopilot_config enabled did not sync to pulse trigger';
  END IF;

  IF v_next_fire_at IS NULL OR v_next_fire_at <= now() THEN
    RAISE EXCEPTION 'autopilot_config sync did not refresh next_fire_at';
  END IF;
END
$$;

ROLLBACK;
