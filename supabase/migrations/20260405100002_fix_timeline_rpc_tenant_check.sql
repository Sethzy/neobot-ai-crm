-- Fix: validate caller's client_id inside SECURITY DEFINER RPC
-- Without this check, a caller could pass any p_client_id and write
-- into another tenant's timeline. RLS doesn't help because SECURITY
-- DEFINER bypasses it.

CREATE OR REPLACE FUNCTION public.upsert_timeline_activity(
  p_client_id UUID,
  p_record_type TEXT,
  p_record_id UUID,
  p_name TEXT,
  p_properties JSONB,
  p_actor_type TEXT,
  p_actor_label TEXT,
  p_happened_at TIMESTAMPTZ DEFAULT now()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_existing_properties JSONB;
  v_existing_diff JSONB;
  v_new_diff JSONB;
  v_merged_diff JSONB;
  v_key TEXT;
  v_value JSONB;
  v_result_id UUID;
  v_next_properties JSONB;
BEGIN
  -- Tenant isolation: reject calls where p_client_id does not match the
  -- authenticated user's tenant. This is the critical guard because
  -- SECURITY DEFINER bypasses RLS.
  IF p_client_id IS DISTINCT FROM public.get_my_client_id() THEN
    RAISE EXCEPTION 'client_id mismatch: caller does not own this tenant';
  END IF;

  SELECT id, properties
  INTO v_existing_id, v_existing_properties
  FROM public.timeline_activities
  WHERE client_id = p_client_id
    AND record_type = p_record_type
    AND record_id = p_record_id
    AND name = p_name
    AND actor_type = p_actor_type
    AND created_at > (now() - INTERVAL '10 minutes')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.timeline_activities (
      client_id,
      record_type,
      record_id,
      name,
      properties,
      actor_type,
      actor_label,
      happened_at
    )
    VALUES (
      p_client_id,
      p_record_type,
      p_record_id,
      p_name,
      COALESCE(p_properties, '{}'::jsonb),
      p_actor_type,
      p_actor_label,
      p_happened_at
    )
    RETURNING id INTO v_result_id;

    RETURN v_result_id;
  END IF;

  v_existing_diff := COALESCE(v_existing_properties -> 'diff', '{}'::jsonb);
  v_new_diff := COALESCE(p_properties -> 'diff', '{}'::jsonb);
  v_merged_diff := v_existing_diff;

  FOR v_key, v_value IN
    SELECT key, value
    FROM jsonb_each(v_new_diff)
  LOOP
    IF v_merged_diff ? v_key THEN
      v_merged_diff := jsonb_set(
        v_merged_diff,
        ARRAY[v_key],
        jsonb_build_object(
          'before',
          COALESCE(v_merged_diff -> v_key -> 'before', v_value -> 'before'),
          'after',
          v_value -> 'after'
        )
      );
    ELSE
      v_merged_diff := jsonb_set(v_merged_diff, ARRAY[v_key], v_value);
    END IF;
  END LOOP;

  v_next_properties := jsonb_strip_nulls(
    jsonb_build_object(
      'diff',
      CASE
        WHEN v_merged_diff = '{}'::jsonb THEN NULL
        ELSE v_merged_diff
      END,
      'updatedFields',
      CASE
        WHEN v_merged_diff = '{}'::jsonb THEN NULL
        ELSE (
          SELECT jsonb_agg(key ORDER BY key)
          FROM jsonb_object_keys(v_merged_diff) AS key
        )
      END,
      'before',
      COALESCE(v_existing_properties -> 'before', p_properties -> 'before'),
      'after',
      COALESCE(p_properties -> 'after', v_existing_properties -> 'after')
    )
  );

  UPDATE public.timeline_activities
  SET properties = v_next_properties,
      actor_label = COALESCE(p_actor_label, actor_label),
      updated_at = now()
  WHERE id = v_existing_id
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;
