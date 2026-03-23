ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS tool_schemas JSONB NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.connections.tool_schemas IS 'Cached Composio tool schemas, persisted at activation time to avoid external API calls on every run.';
