-- Drop the legacy single-note columns from contacts, companies, and deals.
-- All note data now lives in the record_notes table (created in 20260405000001).

ALTER TABLE public.contacts DROP COLUMN IF EXISTS notes;
ALTER TABLE public.companies DROP COLUMN IF EXISTS notes;
ALTER TABLE public.deals DROP COLUMN IF EXISTS notes;
