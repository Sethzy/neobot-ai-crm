-- Configurable CRM Columns: add new default-hideable columns per design doc.
-- These columns always exist in DB; visibility is controlled by field config.

-- Contacts: add city, job_title, linkedin, x_link, created_by
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS linkedin text,
  ADD COLUMN IF NOT EXISTS x_link text,
  ADD COLUMN IF NOT EXISTS created_by text;

COMMENT ON COLUMN public.contacts.city IS 'Contact city (default-hideable field)';
COMMENT ON COLUMN public.contacts.job_title IS 'Contact job title (default-hideable field)';
COMMENT ON COLUMN public.contacts.linkedin IS 'LinkedIn profile URL';
COMMENT ON COLUMN public.contacts.x_link IS 'X/Twitter profile URL';
COMMENT ON COLUMN public.contacts.created_by IS 'Who created this contact (agent or user)';

-- Companies: add linkedin
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS linkedin text;

COMMENT ON COLUMN public.companies.linkedin IS 'Company LinkedIn page URL';

-- Deals: add name, close_date, point_of_contact_id
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS close_date date,
  ADD COLUMN IF NOT EXISTS point_of_contact_id uuid REFERENCES public.contacts(contact_id);

COMMENT ON COLUMN public.deals.name IS 'Generic deal name (replaces address as identity)';
COMMENT ON COLUMN public.deals.close_date IS 'Expected close date';
COMMENT ON COLUMN public.deals.point_of_contact_id IS 'Primary contact for this deal';

-- Rename price -> amount on deals (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'amount'
  ) THEN
    ALTER TABLE public.deals RENAME COLUMN price TO amount;
  END IF;
END $$;
