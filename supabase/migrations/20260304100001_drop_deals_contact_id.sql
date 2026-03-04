-- PR6b: remove deals.contact_id FK in favor of deal_contacts join table.
-- Also removes the composite FK and indexes from the hardening migration (110006).

-- 1. Drop the composite FK added by hardening migration.
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_client_contact_tenant_fkey;

-- 2. Drop the composite index for deal->contact tenant lookups.
DROP INDEX IF EXISTS idx_deals_client_contact_id;

-- 3. Drop the original single-column FK and index.
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_contact_id_fkey;
DROP INDEX IF EXISTS idx_deals_contact_id;

-- 4. Drop the column.
ALTER TABLE public.deals DROP COLUMN contact_id;

-- 5. Add tenant-scoped composite FKs to deal_contacts for cross-tenant safety.
ALTER TABLE public.deal_contacts
  ADD CONSTRAINT deal_contacts_client_deal_tenant_fkey
  FOREIGN KEY (client_id, deal_id)
  REFERENCES public.deals(client_id, deal_id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE public.deal_contacts
  ADD CONSTRAINT deal_contacts_client_contact_tenant_fkey
  FOREIGN KEY (client_id, contact_id)
  REFERENCES public.contacts(client_id, contact_id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;
