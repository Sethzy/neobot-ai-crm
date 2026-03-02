-- PR5: crm_config table for client-level CRM customization.
-- Decision refs: DATA-01, DATA-03, DATA-09.

CREATE TABLE public.crm_config (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(client_id) ON DELETE CASCADE,
  deal_stages JSONB,
  task_types JSONB,
  interaction_types JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_crm_config_updated_at
  BEFORE UPDATE ON public.crm_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
