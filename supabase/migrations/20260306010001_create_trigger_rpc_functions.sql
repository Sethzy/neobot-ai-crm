-- PR 18: Trigger claim/release RPC helpers for cron scanning.
-- Decision refs: TRIG-01, TRIG-02.

CREATE OR REPLACE FUNCTION public.claim_due_triggers()
RETURNS SETOF public.agent_triggers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.release_trigger_claim(
  p_trigger_id UUID,
  p_run_id UUID,
  p_status TEXT DEFAULT 'completed'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released_count INTEGER;
BEGIN
  UPDATE public.agent_triggers
  SET
    current_run_id = NULL,
    last_status = p_status
  WHERE
    id = p_trigger_id
    AND current_run_id = p_run_id;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count > 0;
END;
$$;

COMMENT ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT)
IS 'Releases one trigger claim only when the supplied run token still matches.';
