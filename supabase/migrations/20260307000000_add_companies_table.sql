-- PR 15d: Add Company as standard CRM object (CRM triad completion).
-- Decision refs: DATA-01, DATA-03, DATA-09.

CREATE TABLE public.companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_client_id ON public.companies(client_id);
CREATE INDEX idx_companies_client_name ON public.companies(client_id, name);

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.contacts
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_contacts_company_id ON public.contacts(company_id);

ALTER TABLE public.deals
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_deals_company_id ON public.deals(company_id);

ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS company_industries JSONB,
  ADD COLUMN IF NOT EXISTS company_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_label TEXT NOT NULL DEFAULT 'Company';

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select_own ON public.companies
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY companies_insert_own ON public.companies
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY companies_update_own ON public.companies
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY companies_delete_own ON public.companies
  FOR DELETE USING (client_id = public.get_my_client_id());
