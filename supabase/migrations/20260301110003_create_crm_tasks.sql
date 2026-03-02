-- PR5: crm_tasks table for follow-up and workflow tasks.
-- Decision refs: DATA-01, DATA-03, DATA-09.

CREATE TABLE public.crm_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(contact_id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(deal_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_tasks_client_id ON public.crm_tasks(client_id);
CREATE INDEX idx_crm_tasks_status ON public.crm_tasks(client_id, status);
CREATE INDEX idx_crm_tasks_due_date ON public.crm_tasks(client_id, due_date);

CREATE TRIGGER update_crm_tasks_updated_at
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
