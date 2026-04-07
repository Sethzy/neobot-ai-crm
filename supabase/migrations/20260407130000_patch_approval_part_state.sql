-- Atomically resolve an approval event and patch the persisted assistant tool
-- part from approval-requested to approval-responded.
--
-- This fixes the state-sync bug in the AI SDK approval flow: the follow-up run
-- reloads conversation_messages from Postgres, so approval_events and the
-- conversation message history must be updated in the same transaction.

CREATE OR REPLACE FUNCTION public.patch_approval_part_state(
  p_client_id UUID,
  p_thread_id UUID,
  p_approval_id TEXT,
  p_approved BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event approval_events%ROWTYPE;
  v_updated_message_count INTEGER;
  v_authoritative_approved BOOLEAN;
  v_resolution_status TEXT;
BEGIN
  IF auth.role() <> 'service_role'
     AND p_client_id IS DISTINCT FROM public.get_my_client_id() THEN
    RAISE EXCEPTION 'client_id mismatch: caller does not own this tenant';
  END IF;

  SELECT *
  INTO v_event
  FROM public.approval_events
  WHERE client_id = p_client_id
    AND thread_id = p_thread_id
    AND approval_id = p_approval_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'missing',
      'event', NULL
    );
  END IF;

  IF v_event.status = 'pending' THEN
    UPDATE public.approval_events
    SET status = CASE WHEN p_approved THEN 'approved' ELSE 'denied' END,
        resolved_at = now()
    WHERE id = v_event.id
    RETURNING * INTO v_event;
    v_resolution_status := 'updated';
  ELSIF v_event.status NOT IN ('approved', 'denied') THEN
    RETURN jsonb_build_object(
      'status', 'missing',
      'event', NULL
    );
  ELSE
    v_resolution_status := 'already_resolved';
  END IF;

  v_authoritative_approved := v_event.status = 'approved';

  UPDATE public.conversation_messages
  SET parts = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->'approval'->>'id' = p_approval_id
          AND elem->>'state' IN ('approval-requested', 'approval-responded')
        THEN jsonb_set(
          jsonb_set(elem, '{state}', '"approval-responded"'::jsonb),
          '{approval,approved}',
          to_jsonb(v_authoritative_approved),
          true
        )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(parts) AS elem
  )
  WHERE thread_id = p_thread_id
    AND client_id = p_client_id
    AND role = 'assistant'
    AND parts IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(parts) AS elem
      WHERE elem->'approval'->>'id' = p_approval_id
        AND elem->>'state' IN ('approval-requested', 'approval-responded')
    );

  GET DIAGNOSTICS v_updated_message_count = ROW_COUNT;

  IF v_updated_message_count = 0 THEN
    RAISE EXCEPTION 'No persisted approval-requested part found for approval_id %', p_approval_id;
  END IF;

  RETURN jsonb_build_object(
    'status', v_resolution_status,
    'event',
    to_jsonb(v_event)
  );
END;
$$;
