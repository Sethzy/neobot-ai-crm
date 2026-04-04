-- Add multi-note support for CRM records.
-- Creates one-to-many notes for contacts, companies, and deals, then backfills
-- existing legacy `notes` column values into first-class note rows.

CREATE TABLE public.record_notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('contact', 'company', 'deal')),
  record_id UUID NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_record_notes_lookup
  ON public.record_notes(client_id, record_type, record_id);

CREATE TRIGGER update_record_notes_updated_at
  BEFORE UPDATE ON public.record_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.record_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_notes_select_own ON public.record_notes
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY record_notes_insert_own ON public.record_notes
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY record_notes_update_own ON public.record_notes
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY record_notes_delete_own ON public.record_notes
  FOR DELETE USING (client_id = public.get_my_client_id());

INSERT INTO public.record_notes (client_id, record_type, record_id, body)
SELECT client_id, 'contact', contact_id, notes
FROM public.contacts
WHERE notes IS NOT NULL AND notes != '';

INSERT INTO public.record_notes (client_id, record_type, record_id, body)
SELECT client_id, 'company', company_id, notes
FROM public.companies
WHERE notes IS NOT NULL AND notes != '';

INSERT INTO public.record_notes (client_id, record_type, record_id, body)
SELECT client_id, 'deal', deal_id, notes
FROM public.deals
WHERE notes IS NOT NULL AND notes != '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'record_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.record_notes;
  END IF;
END $$;
