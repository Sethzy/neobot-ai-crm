-- Add file attachments for CRM records.
-- Stores attachment metadata for contacts, companies, and deals while the
-- underlying file binary lives in the shared agent-files storage bucket.

CREATE TABLE public.record_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('contact', 'company', 'deal')),
  record_id UUID NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  file_category TEXT NOT NULL CHECK (
    file_category IN ('pdf', 'document', 'spreadsheet', 'presentation', 'image', 'other')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_record_attachments_lookup
  ON public.record_attachments(client_id, record_type, record_id);

CREATE TRIGGER update_record_attachments_updated_at
  BEFORE UPDATE ON public.record_attachments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.record_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_attachments_select_own ON public.record_attachments
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY record_attachments_insert_own ON public.record_attachments
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY record_attachments_update_own ON public.record_attachments
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY record_attachments_delete_own ON public.record_attachments
  FOR DELETE USING (client_id = public.get_my_client_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'record_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.record_attachments;
  END IF;
END $$;
