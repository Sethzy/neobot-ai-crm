-- PR5: contacts table for CRM.
-- Decision refs: DATA-01, DATA-03, DATA-09.

CREATE TABLE public.contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  type TEXT NOT NULL CHECK (type IN ('buyer', 'seller', 'landlord', 'tenant', 'agent', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_client_id ON public.contacts(client_id);
CREATE INDEX idx_contacts_type ON public.contacts(client_id, type);
CREATE INDEX idx_contacts_name ON public.contacts(client_id, last_name, first_name);

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
