-- PR41: Telegram deep-link pairing tokens (short-lived, single-use).

CREATE TABLE public.telegram_pairing_tokens (
  token text PRIMARY KEY,
  client_id uuid NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_pairing_tokens_client_id
  ON public.telegram_pairing_tokens(client_id);

COMMENT ON TABLE public.telegram_pairing_tokens IS
  'Short-lived, single-use tokens for Telegram deep-link account pairing.';

ALTER TABLE public.telegram_pairing_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_pairing_tokens_select_own
  ON public.telegram_pairing_tokens
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY telegram_pairing_tokens_insert_own
  ON public.telegram_pairing_tokens
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY telegram_pairing_tokens_delete_own
  ON public.telegram_pairing_tokens
  FOR DELETE
  USING (client_id = public.get_my_client_id());
