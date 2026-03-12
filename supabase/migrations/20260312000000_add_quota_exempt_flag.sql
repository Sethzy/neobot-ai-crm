-- Add quota_exempt flag to clients for internal/test accounts.
-- Exempt clients bypass message quota enforcement entirely.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS quota_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.quota_exempt IS
  'When true, this client is exempt from monthly message quota limits (e.g. internal test accounts).';

-- Re-create get_message_quota_status to respect quota_exempt.
CREATE OR REPLACE FUNCTION public.get_message_quota_status(
  p_client_id UUID
)
RETURNS TABLE (
  client_id uuid,
  plan_name text,
  monthly_message_limit integer,
  messages_used integer,
  messages_remaining integer,
  period_start date,
  next_reset_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_period_start date := date_trunc('month', timezone('Asia/Singapore', now()))::date;
  v_next_reset_date date :=
    (date_trunc('month', timezone('Asia/Singapore', now())) + interval '1 month')::date;
  v_plan_name text;
  v_quota_exempt boolean;
  v_limit integer;
  v_messages_used integer := 0;
BEGIN
  IF auth.role() <> 'service_role'
     AND p_client_id <> public.get_my_client_id() THEN
    RAISE EXCEPTION 'Not authorized to read this client''s message quota.';
  END IF;

  SELECT
    CASE COALESCE(c.plan_name, 'Free')
      WHEN 'Pro' THEN 'Pro'
      WHEN 'Max' THEN 'Max'
      ELSE 'Free'
    END,
    COALESCE(c.quota_exempt, false)
  INTO v_plan_name, v_quota_exempt
  FROM public.clients AS c
  WHERE c.client_id = p_client_id;

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Client not found.';
  END IF;

  -- Exempt clients get an effectively unlimited quota.
  IF v_quota_exempt THEN
    v_limit := 999999;
  ELSE
    v_limit := CASE v_plan_name
      WHEN 'Pro' THEN 500
      WHEN 'Max' THEN 2000
      ELSE 100
    END;
  END IF;

  SELECT COALESCE(usage.messages_used, 0)
  INTO v_messages_used
  FROM public.client_message_usage_monthly AS usage
  WHERE usage.client_id = p_client_id
    AND usage.period_start = v_period_start;

  -- Guard against NULL when no usage row exists yet.
  v_messages_used := COALESCE(v_messages_used, 0);

  RETURN QUERY
  SELECT
    p_client_id,
    v_plan_name,
    v_limit,
    v_messages_used,
    GREATEST(v_limit - v_messages_used, 0),
    v_period_start,
    v_next_reset_date;
END;
$$;

-- Re-create consume_message_quota to respect quota_exempt.
CREATE OR REPLACE FUNCTION public.consume_message_quota(
  p_client_id UUID
)
RETURNS TABLE (
  allowed boolean,
  client_id uuid,
  plan_name text,
  monthly_message_limit integer,
  messages_used integer,
  messages_remaining integer,
  period_start date,
  next_reset_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_period_start date := date_trunc('month', timezone('Asia/Singapore', now()))::date;
  v_next_reset_date date :=
    (date_trunc('month', timezone('Asia/Singapore', now())) + interval '1 month')::date;
  v_plan_name text;
  v_quota_exempt boolean;
  v_limit integer;
  v_messages_used integer;
BEGIN
  IF auth.role() <> 'service_role'
     AND p_client_id <> public.get_my_client_id() THEN
    RAISE EXCEPTION 'Not authorized to consume this client''s message quota.';
  END IF;

  SELECT
    CASE COALESCE(c.plan_name, 'Free')
      WHEN 'Pro' THEN 'Pro'
      WHEN 'Max' THEN 'Max'
      ELSE 'Free'
    END,
    COALESCE(c.quota_exempt, false)
  INTO v_plan_name, v_quota_exempt
  FROM public.clients AS c
  WHERE c.client_id = p_client_id;

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Client not found.';
  END IF;

  -- Exempt clients: always allowed, still track usage for observability but never block.
  IF v_quota_exempt THEN
    v_limit := 999999;

    INSERT INTO public.client_message_usage_monthly AS usage (
      client_id, period_start, messages_used, created_at, updated_at
    )
    VALUES (p_client_id, v_period_start, 1, now(), now())
    ON CONFLICT (client_id, period_start) DO UPDATE
    SET messages_used = usage.messages_used + 1, updated_at = now()
    RETURNING usage.messages_used
    INTO v_messages_used;

    RETURN QUERY
    SELECT
      true,
      p_client_id,
      v_plan_name,
      v_limit,
      v_messages_used,
      GREATEST(v_limit - v_messages_used, 0),
      v_period_start,
      v_next_reset_date;
    RETURN;
  END IF;

  v_limit := CASE v_plan_name
    WHEN 'Pro' THEN 500
    WHEN 'Max' THEN 2000
    ELSE 100
  END;

  INSERT INTO public.client_message_usage_monthly AS usage (
    client_id,
    period_start,
    messages_used,
    created_at,
    updated_at
  )
  VALUES (
    p_client_id,
    v_period_start,
    1,
    now(),
    now()
  )
  ON CONFLICT (client_id, period_start) DO UPDATE
  SET
    messages_used = usage.messages_used + 1,
    updated_at = now()
  WHERE usage.messages_used < v_limit
  RETURNING usage.messages_used
  INTO v_messages_used;

  IF v_messages_used IS NULL THEN
    SELECT COALESCE(usage.messages_used, 0)
    INTO v_messages_used
    FROM public.client_message_usage_monthly AS usage
    WHERE usage.client_id = p_client_id
      AND usage.period_start = v_period_start;

    RETURN QUERY
    SELECT
      false,
      p_client_id,
      v_plan_name,
      v_limit,
      v_messages_used,
      GREATEST(v_limit - v_messages_used, 0),
      v_period_start,
      v_next_reset_date;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    true,
    p_client_id,
    v_plan_name,
    v_limit,
    v_messages_used,
    GREATEST(v_limit - v_messages_used, 0),
    v_period_start,
    v_next_reset_date;
END;
$$;

-- release_message_quota is unchanged — it doesn't check limits, just decrements.

-- Flag the internal test account as exempt.
UPDATE public.clients
SET quota_exempt = true
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'limzheyi1996@gmail.com'
);
