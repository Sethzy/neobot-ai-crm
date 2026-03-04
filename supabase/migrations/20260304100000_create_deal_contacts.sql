-- PR6b: deal_contacts many-to-many join table.
-- Replaces deals.contact_id FK. Supports couples, co-broking, multiple stakeholders.
-- Decision refs: DATA-03, DATA-09.

CREATE TABLE public.deal_contacts (
  deal_contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(deal_id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(contact_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'agent', 'other')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate contact-deal pairs.
  CONSTRAINT deal_contacts_unique_pair UNIQUE (deal_id, contact_id)
);

-- Tenant isolation index.
CREATE INDEX idx_deal_contacts_client_id ON public.deal_contacts(client_id);

-- Lookup indexes for common queries.
CREATE INDEX idx_deal_contacts_deal_id ON public.deal_contacts(deal_id);
CREATE INDEX idx_deal_contacts_contact_id ON public.deal_contacts(contact_id);

-- Composite uniqueness for tenant-scoped FK safety.
ALTER TABLE public.deal_contacts
  ADD CONSTRAINT deal_contacts_client_deal_unique UNIQUE (client_id, deal_id, contact_id);

COMMENT ON TABLE public.deal_contacts IS 'Many-to-many join: deals <-> contacts with role and primary flag.';
COMMENT ON COLUMN public.deal_contacts.role IS 'Role of contact in the deal (buyer, seller, agent, other).';
COMMENT ON COLUMN public.deal_contacts.is_primary IS 'Primary contact for display. At most one per deal (enforced by app layer).';
