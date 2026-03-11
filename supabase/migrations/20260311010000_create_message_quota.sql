-- PR38c: monthly per-client message quota tracking and RPC helpers.

CREATE TABLE public.client_message_usage_monthly (
  client_id      uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  period_start   date NOT NULL,
  messages_used  integer NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (client_id, period_start)
);

ALTER TABLE public.client_message_usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_message_usage_monthly_select"
  ON public.client_message_usage_monthly FOR SELECT
  USING (client_id = public.get_my_client_id());

COMMENT ON TABLE public.client_message_usage_monthly IS
  'Monthly aggregate of brand-new inbound user chat turns, keyed by Singapore calendar month.';

COMMENT ON COLUMN public.client_message_usage_monthly.period_start IS
  'First day of the applicable month in Asia/Singapore.';

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
DECLARE
  v_period_start date := date_trunc('month', timezone('Asia/Singapore', now()))::date;
  v_next_reset_date date :=
    (date_trunc('month', timezone('Asia/Singapore', now())) + interval '1 month')::date;
  v_plan_name text;
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
    END
  INTO v_plan_name
  FROM public.clients AS c
  WHERE c.client_id = p_client_id;

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Client not found.';
  END IF;

  v_limit := CASE v_plan_name
    WHEN 'Pro' THEN 500
    WHEN 'Max' THEN 2000
    ELSE 100
  END;

  SELECT COALESCE(usage.messages_used, 0)
  INTO v_messages_used
  FROM public.client_message_usage_monthly AS usage
  WHERE usage.client_id = p_client_id
    AND usage.period_start = v_period_start;

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
DECLARE
  v_period_start date := date_trunc('month', timezone('Asia/Singapore', now()))::date;
  v_next_reset_date date :=
    (date_trunc('month', timezone('Asia/Singapore', now())) + interval '1 month')::date;
  v_plan_name text;
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
    END
  INTO v_plan_name
  FROM public.clients AS c
  WHERE c.client_id = p_client_id;

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Client not found.';
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

REVOKE ALL ON FUNCTION public.get_message_quota_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_message_quota_status(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_message_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_message_quota(UUID) TO authenticated, service_role;
