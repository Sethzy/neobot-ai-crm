-- PR26a: expand connection metadata for multi-connection workflows and per-tool activation.
-- Decision refs: CONN-02, CONN-03, TOOL-04.

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_status_check;

ALTER TABLE public.connections
  ADD CONSTRAINT connections_status_check
  CHECK (status IN ('active', 'inactive', 'error', 'pending'));

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_client_toolkit_unique;

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_client_id_toolkit_slug_key;

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS account_identifier TEXT,
  ADD COLUMN IF NOT EXISTS activated_tools TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_connections_client_status
  ON public.connections (client_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_one_pending_per_toolkit
  ON public.connections (client_id, toolkit_slug)
  WHERE status = 'pending';
