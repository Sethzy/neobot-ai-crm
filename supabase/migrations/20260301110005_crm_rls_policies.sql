-- PR5: enable and enforce RLS for CRM tables.
-- DATA-03 tenant isolation with public.get_my_client_id().

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_select_own ON public.contacts
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY contacts_insert_own ON public.contacts
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY contacts_update_own ON public.contacts
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY contacts_delete_own ON public.contacts
  FOR DELETE USING (client_id = public.get_my_client_id());

CREATE POLICY deals_select_own ON public.deals
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY deals_insert_own ON public.deals
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY deals_update_own ON public.deals
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY deals_delete_own ON public.deals
  FOR DELETE USING (client_id = public.get_my_client_id());

CREATE POLICY interactions_select_own ON public.interactions
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY interactions_insert_own ON public.interactions
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY interactions_update_own ON public.interactions
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY interactions_delete_own ON public.interactions
  FOR DELETE USING (client_id = public.get_my_client_id());

CREATE POLICY crm_tasks_select_own ON public.crm_tasks
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY crm_tasks_insert_own ON public.crm_tasks
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY crm_tasks_update_own ON public.crm_tasks
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY crm_tasks_delete_own ON public.crm_tasks
  FOR DELETE USING (client_id = public.get_my_client_id());

CREATE POLICY crm_config_select_own ON public.crm_config
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY crm_config_insert_own ON public.crm_config
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY crm_config_update_own ON public.crm_config
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY crm_config_delete_own ON public.crm_config
  FOR DELETE USING (client_id = public.get_my_client_id());
