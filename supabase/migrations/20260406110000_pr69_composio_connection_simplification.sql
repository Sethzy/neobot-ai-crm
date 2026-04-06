-- PR69: enforce one connection per toolkit and remove cached Composio tool schemas.

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_client_toolkit_unique;

DROP INDEX IF EXISTS idx_connections_one_pending_per_toolkit;

ALTER TABLE public.connections
  ADD CONSTRAINT connections_client_toolkit_unique UNIQUE (client_id, toolkit_slug);

ALTER TABLE public.connections
  DROP COLUMN IF EXISTS tool_schemas;
