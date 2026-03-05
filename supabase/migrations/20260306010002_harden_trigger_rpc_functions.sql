-- PR 18 follow-up: harden trigger RPC execution and atomically advance schedules.
-- Decision refs: TRIG-01, TRIG-02.

CREATE OR REPLACE FUNCTION public.claim_due_triggers()
RETURNS SETOF public.agent_triggers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_due_triggers is restricted to service_role';
  END IF;

  RETURN QUERY
  UPDATE public.agent_triggers
  SET
    current_run_id = gen_random_uuid(),
    last_fired_at = now()
  WHERE
    enabled = true
    AND current_run_id IS NULL
    AND next_fire_at IS NOT NULL
    AND next_fire_at <= now()
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.claim_due_triggers()
IS 'Atomically claims all due triggers for one scanner tick via UPDATE ... RETURNING.';

REVOKE ALL ON FUNCTION public.claim_due_triggers() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_triggers() TO service_role;

CREATE OR REPLACE FUNCTION public.release_stale_trigger_claims(
  p_stale_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released_count INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'release_stale_trigger_claims is restricted to service_role';
  END IF;

  UPDATE public.agent_triggers
  SET
    current_run_id = NULL,
    last_status = 'stale_released'
  WHERE
    current_run_id IS NOT NULL
    AND last_fired_at < now() - make_interval(mins => p_stale_minutes);

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count;
END;
$$;

COMMENT ON FUNCTION public.release_stale_trigger_claims(INTEGER)
IS 'Releases trigger claims that have exceeded the configured stale threshold.';

REVOKE ALL ON FUNCTION public.release_stale_trigger_claims(INTEGER)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_trigger_claims(INTEGER) TO service_role;

DROP FUNCTION IF EXISTS public.release_trigger_claim(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.release_trigger_claim(
  p_trigger_id UUID,
  p_run_id UUID,
  p_status TEXT DEFAULT 'completed',
  p_next_fire_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released_count INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'release_trigger_claim is restricted to service_role';
  END IF;

  UPDATE public.agent_triggers
  SET
    current_run_id = NULL,
    last_status = p_status,
    next_fire_at = COALESCE(p_next_fire_at, next_fire_at)
  WHERE
    id = p_trigger_id
    AND current_run_id = p_run_id;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count > 0;
END;
$$;

COMMENT ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ)
IS 'Releases one trigger claim only when the supplied run token still matches, optionally advancing next_fire_at.';

REVOKE ALL ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ)
TO service_role;
