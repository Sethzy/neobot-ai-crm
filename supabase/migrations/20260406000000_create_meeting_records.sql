-- Add durable meeting ingestion records for browser-recorded audio uploads.
-- Tracks ingestion state, transcript storage, and optional CRM links for
-- agent-generated follow-up actions.

CREATE TABLE public.meeting_records (
  meeting_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  transcript_path TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  notes TEXT,
  linked_contact_id UUID REFERENCES public.contacts(contact_id) ON DELETE SET NULL,
  linked_company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL,
  linked_deal_id UUID REFERENCES public.deals(deal_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'transcribing', 'transcribed', 'processing', 'completed', 'failed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meeting_records_idempotency_key_client_id_unique
    UNIQUE (idempotency_key, client_id)
);

CREATE INDEX idx_meeting_records_client_thread
  ON public.meeting_records(client_id, thread_id, created_at DESC);

CREATE TRIGGER update_meeting_records_updated_at
  BEFORE UPDATE ON public.meeting_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.meeting_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_records_select_own ON public.meeting_records
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY meeting_records_insert_own ON public.meeting_records
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY meeting_records_update_own ON public.meeting_records
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());
