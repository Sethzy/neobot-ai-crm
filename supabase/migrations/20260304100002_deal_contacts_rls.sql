-- PR6b: RLS for deal_contacts join table.
-- Follows existing CRM RLS pattern from 20260301110005.

ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_contacts_select_own ON public.deal_contacts
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY deal_contacts_insert_own ON public.deal_contacts
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY deal_contacts_update_own ON public.deal_contacts
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY deal_contacts_delete_own ON public.deal_contacts
  FOR DELETE USING (client_id = public.get_my_client_id());
