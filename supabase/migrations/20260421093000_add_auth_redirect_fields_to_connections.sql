-- PR??: persist Composio auth-link state on connection rows so the app can
-- respect Composio-provided link expiry instead of guessing a local TTL.

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS auth_redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_redirect_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.connections.auth_redirect_url IS
  'Temporary Composio-hosted sign-in URL for a pending connect or reconnect flow.';

COMMENT ON COLUMN public.connections.auth_redirect_expires_at IS
  'Timestamp from Composio indicating when the temporary auth_redirect_url expires.';
