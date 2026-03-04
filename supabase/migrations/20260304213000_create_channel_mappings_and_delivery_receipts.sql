-- Stage D2: channel/thread mapping + inbound delivery idempotency.

CREATE TABLE public.conversation_channel_mappings (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  channel TEXT NOT NULL,
  external_conversation_id TEXT NOT NULL,
  thread_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_channel_mappings_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(client_id) ON DELETE CASCADE,
  CONSTRAINT conversation_channel_mappings_thread_id_fkey
    FOREIGN KEY (thread_id) REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  CONSTRAINT conversation_channel_mappings_client_channel_external_key
    UNIQUE (client_id, channel, external_conversation_id)
);

CREATE OR REPLACE FUNCTION public.set_conversation_channel_mappings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_conversation_channel_mappings_updated_at
  BEFORE UPDATE ON public.conversation_channel_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_conversation_channel_mappings_updated_at();

CREATE INDEX idx_conversation_channel_mappings_thread_id
  ON public.conversation_channel_mappings(thread_id);

CREATE INDEX idx_conversation_channel_mappings_client_channel
  ON public.conversation_channel_mappings(client_id, channel);

COMMENT ON TABLE public.conversation_channel_mappings IS
  'Maps external channel conversations (telegram/whatsapp/web) to canonical thread IDs.';

CREATE TABLE public.conversation_channel_delivery_receipts (
  receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  channel TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  thread_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_channel_delivery_receipts_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(client_id) ON DELETE CASCADE,
  CONSTRAINT conversation_channel_delivery_receipts_thread_id_fkey
    FOREIGN KEY (thread_id) REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  CONSTRAINT conversation_channel_delivery_receipts_client_channel_delivery_key
    UNIQUE (client_id, channel, delivery_id)
);

CREATE INDEX idx_conversation_channel_delivery_receipts_thread_id
  ON public.conversation_channel_delivery_receipts(thread_id);

COMMENT ON TABLE public.conversation_channel_delivery_receipts IS
  'Idempotency ledger for inbound channel delivery IDs.';

ALTER TABLE public.conversation_channel_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_channel_mappings_select_own
  ON public.conversation_channel_mappings
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY conversation_channel_mappings_insert_own
  ON public.conversation_channel_mappings
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY conversation_channel_mappings_update_own
  ON public.conversation_channel_mappings
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

ALTER TABLE public.conversation_channel_delivery_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_channel_delivery_receipts_select_own
  ON public.conversation_channel_delivery_receipts
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY conversation_channel_delivery_receipts_insert_own
  ON public.conversation_channel_delivery_receipts
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());
