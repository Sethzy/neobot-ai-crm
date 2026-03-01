-- PR4: Queue table for messages that arrive while a thread run is active.
-- Implements App Spec §11.2 per-thread serialization with DB-backed queueing.

CREATE TABLE public.thread_queue_records (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_thread_queue_records_thread_created_at
  ON public.thread_queue_records(thread_id, created_at);

COMMENT ON TABLE public.thread_queue_records IS 'Messages queued while a run is active for a thread.';
COMMENT ON COLUMN public.thread_queue_records.content IS 'Queued message payload. v1 uses { text: string }.';

ALTER TABLE public.thread_queue_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY thread_queue_records_select_own ON public.thread_queue_records
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY thread_queue_records_insert_own ON public.thread_queue_records
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY thread_queue_records_delete_own ON public.thread_queue_records
  FOR DELETE
  USING (client_id = public.get_my_client_id());
