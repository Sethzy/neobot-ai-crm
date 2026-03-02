-- PR5: interactions table for CRM activity history.
-- Decision refs: DATA-01, DATA-03, DATA-09.

CREATE TABLE public.interactions (
  interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(contact_id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(deal_id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('call', 'meeting', 'email', 'message', 'viewing', 'note')),
  summary TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interactions_client_id ON public.interactions(client_id);
CREATE INDEX idx_interactions_contact_id ON public.interactions(contact_id);
CREATE INDEX idx_interactions_deal_id ON public.interactions(deal_id);
CREATE INDEX idx_interactions_occurred_at ON public.interactions(client_id, occurred_at DESC);

CREATE TRIGGER update_interactions_updated_at
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
