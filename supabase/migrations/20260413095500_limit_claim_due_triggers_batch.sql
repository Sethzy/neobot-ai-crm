-- Bound one scanner tick to a manageable batch of due trigger claims.

CREATE OR REPLACE FUNCTION public.claim_due_triggers()
RETURNS SETOF public.agent_triggers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_limit CONSTANT INTEGER := 25;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_due_triggers is restricted to service_role';
  END IF;

  RETURN QUERY
  WITH due_triggers AS (
    SELECT id
    FROM public.agent_triggers
    WHERE
      enabled = true
      AND current_run_id IS NULL
      AND next_fire_at IS NOT NULL
      AND next_fire_at <= now()
    ORDER BY next_fire_at ASC, created_at ASC
    LIMIT v_claim_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.agent_triggers AS triggers
  SET
    current_run_id = gen_random_uuid(),
    last_fired_at = now()
  FROM due_triggers
  WHERE triggers.id = due_triggers.id
  RETURNING triggers.*;
END;
$$;

COMMENT ON FUNCTION public.claim_due_triggers()
IS 'Atomically claims up to 25 due triggers for one scanner tick via UPDATE ... FROM ... RETURNING.';
