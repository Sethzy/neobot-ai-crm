-- PR20: make release_trigger_claim retry-aware while preserving service_role-only execution.

DROP FUNCTION IF EXISTS public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.release_trigger_claim(
  p_trigger_id UUID,
  p_run_id UUID,
  p_status TEXT DEFAULT 'completed',
  p_next_fire_at TIMESTAMPTZ DEFAULT NULL,
  p_advance_next_fire_at BOOLEAN DEFAULT true
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
    next_fire_at = CASE
      WHEN p_advance_next_fire_at AND p_next_fire_at IS NOT NULL THEN p_next_fire_at
      WHEN p_advance_next_fire_at THEN next_fire_at
      ELSE next_fire_at
    END,
    retry_count = CASE
      WHEN p_status = 'completed' THEN 0
      WHEN p_status = 'failed_permanent' THEN 0
      WHEN p_advance_next_fire_at AND p_status IN ('failed', 'dispatch_failed') THEN 0
      WHEN p_status IN ('failed', 'dispatch_failed') THEN retry_count + 1
      ELSE retry_count
    END,
    enabled = CASE
      WHEN p_status = 'failed_permanent' THEN false
      ELSE enabled
    END
  WHERE
    id = p_trigger_id
    AND current_run_id = p_run_id;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count > 0;
END;
$$;

COMMENT ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN)
IS 'Releases one trigger claim, optionally advances next_fire_at, and updates retry state for retry-managed triggers.';

REVOKE ALL ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN)
TO service_role;
