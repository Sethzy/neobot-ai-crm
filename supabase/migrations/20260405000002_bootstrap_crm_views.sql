-- Idempotent function to seed default CRM views for a client.
-- Reads crm_config to determine non-terminal deal stages (config-driven, not hardcoded).

CREATE OR REPLACE FUNCTION public.crm_default_deal_stages()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '["leads","negotiation","offer","closing","lost"]'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.ensure_crm_views_for_client(p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_default_deal_stages JSONB;
  v_deal_stages JSONB;
  v_active_stages JSONB;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'ensure_crm_views_for_client is restricted to service_role';
  END IF;

  v_default_deal_stages := public.crm_default_deal_stages();

  INSERT INTO public.crm_config (client_id, deal_stages)
  VALUES (p_client_id, v_default_deal_stages)
  ON CONFLICT (client_id) DO NOTHING;

  SELECT COALESCE(deal_stages, v_default_deal_stages)
  INTO v_deal_stages
  FROM public.crm_config
  WHERE client_id = p_client_id;

  SELECT COALESCE(
    jsonb_agg(filtered.stage ORDER BY filtered.ordinality),
    '[]'::jsonb
  )
  INTO v_active_stages
  FROM (
    SELECT stage, ordinality
    FROM jsonb_array_elements_text(v_deal_stages) WITH ORDINALITY AS stages(stage, ordinality)
    WHERE lower(stage) <> 'lost'
  ) AS filtered;

  INSERT INTO public.crm_views (client_id, name, entity_type, filters, is_seeded) VALUES
    -- Deals
    (p_client_id, 'Active pipeline', 'deals', jsonb_build_object('stage', v_active_stages), TRUE),
    (p_client_id, 'Closing this month', 'deals', '{"close_date_after": "$month_start", "close_date_before": "$month_end"}'::jsonb, TRUE),
    -- Tasks
    (p_client_id, 'Overdue', 'tasks', '{"status": "todo", "due_date_before": "$today"}'::jsonb, TRUE),
    (p_client_id, 'Due this week', 'tasks', '{"due_date_after": "$today", "due_date_before": "$week_end"}'::jsonb, TRUE),
    (p_client_id, 'Done', 'tasks', '{"status": "done"}'::jsonb, TRUE),
    -- Contacts
    (p_client_id, 'Buyers', 'contacts', '{"type": "buyer"}'::jsonb, TRUE),
    (p_client_id, 'Sellers', 'contacts', '{"type": "seller"}'::jsonb, TRUE)
  ON CONFLICT (client_id, entity_type, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_crm_views_for_client(UUID)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_crm_views_for_client(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.bootstrap_crm_views()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.ensure_crm_views_for_client(NEW.client_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_client_created_bootstrap_crm_views
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_crm_views();

COMMENT ON FUNCTION public.bootstrap_crm_views()
  IS 'Creates or repairs the built-in CRM saved views for a client.';

SELECT public.ensure_crm_views_for_client(client_id)
FROM public.clients;
