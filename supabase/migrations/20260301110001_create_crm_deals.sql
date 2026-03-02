-- PR5: deals table for CRM pipeline tracking.
-- Decision refs: DATA-01, DATA-03, DATA-09.

CREATE TABLE public.deals (
  deal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(contact_id) ON DELETE SET NULL,
  address TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'leads' CHECK (stage IN ('leads', 'viewing', 'offer', 'negotiation', 'otp', 'completion', 'lost')),
  price BIGINT CHECK (price IS NULL OR price >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_client_id ON public.deals(client_id);
CREATE INDEX idx_deals_stage ON public.deals(client_id, stage);
CREATE INDEX idx_deals_contact_id ON public.deals(contact_id);

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
