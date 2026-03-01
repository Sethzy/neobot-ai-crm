-- PR3: clients root table for tenant scoping.
-- All user-owned tables reference client_id, not auth.uid() directly.

CREATE TABLE public.clients (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clients IS 'Tenant root entity. All user-owned rows scope to client_id.';
COMMENT ON COLUMN public.clients.user_id IS 'v1: one auth user maps to one client row (UNIQUE).';
