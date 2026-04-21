-- PR??: user-owned messaging channel connections.
-- Keeps personal channel ownership separate from transport routing.

CREATE TABLE public.messaging_channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_conversation_id text NOT NULL,
  target_thread_id uuid NOT NULL
    REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messaging_channel_connections_user_channel_unique
    UNIQUE (user_id, channel),
  CONSTRAINT messaging_channel_connections_channel_external_unique
    UNIQUE (channel, external_conversation_id)
);

CREATE INDEX idx_messaging_channel_connections_user_id
  ON public.messaging_channel_connections(user_id);

CREATE INDEX idx_messaging_channel_connections_client_id
  ON public.messaging_channel_connections(client_id);

CREATE INDEX idx_messaging_channel_connections_target_thread_id
  ON public.messaging_channel_connections(target_thread_id);

CREATE OR REPLACE FUNCTION public.set_messaging_channel_connections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_messaging_channel_connections_updated_at
  BEFORE UPDATE ON public.messaging_channel_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_messaging_channel_connections_updated_at();

COMMENT ON TABLE public.messaging_channel_connections IS
  'User-owned messaging channel connections. Personal ownership source of truth for Telegram and future direct-message channels.';

ALTER TABLE public.messaging_channel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY messaging_channel_connections_select_own
  ON public.messaging_channel_connections
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND client_id = public.get_my_client_id()
  );

CREATE POLICY messaging_channel_connections_insert_own
  ON public.messaging_channel_connections
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND client_id = public.get_my_client_id()
    AND EXISTS (
      SELECT 1
      FROM public.conversation_threads AS threads
      WHERE threads.thread_id = target_thread_id
        AND threads.client_id = public.get_my_client_id()
    )
  );

CREATE POLICY messaging_channel_connections_update_own
  ON public.messaging_channel_connections
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND client_id = public.get_my_client_id()
  )
  WITH CHECK (
    auth.uid() = user_id
    AND client_id = public.get_my_client_id()
    AND EXISTS (
      SELECT 1
      FROM public.conversation_threads AS threads
      WHERE threads.thread_id = target_thread_id
        AND threads.client_id = public.get_my_client_id()
    )
  );

CREATE POLICY messaging_channel_connections_delete_own
  ON public.messaging_channel_connections
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND client_id = public.get_my_client_id()
  );
