-- PR??: user-owned Telegram pairing sessions.
-- Supports both deep-link pairing and copy/paste display codes.

CREATE TABLE public.telegram_pairing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  target_thread_id uuid NOT NULL
    REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  deep_link_token text NOT NULL UNIQUE,
  display_code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_pairing_sessions_user_id
  ON public.telegram_pairing_sessions(user_id);

CREATE INDEX idx_telegram_pairing_sessions_expires_at
  ON public.telegram_pairing_sessions(expires_at);

COMMENT ON TABLE public.telegram_pairing_sessions IS
  'Short-lived Telegram pairing sessions. Each row binds a user to a target thread and exposes both a deep-link token and manual fallback code.';

ALTER TABLE public.telegram_pairing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_pairing_sessions_select_own
  ON public.telegram_pairing_sessions
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND client_id = public.get_my_client_id()
  );

CREATE POLICY telegram_pairing_sessions_insert_own
  ON public.telegram_pairing_sessions
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

CREATE POLICY telegram_pairing_sessions_update_own
  ON public.telegram_pairing_sessions
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

CREATE POLICY telegram_pairing_sessions_delete_own
  ON public.telegram_pairing_sessions
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND client_id = public.get_my_client_id()
  );
