-- PR25: persist Composio connection metadata for runner gating and system reminder context.
-- Decision refs: CONN-01, CONN-02, CONN-03.

CREATE TABLE public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  composio_connected_account_id TEXT NOT NULL UNIQUE,
  toolkit_slug TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connections_client_toolkit_unique UNIQUE (client_id, toolkit_slug)
);

COMMENT ON TABLE public.connections IS
  'Lightweight Composio connection metadata mirrored for runner gating and system reminders.';
COMMENT ON COLUMN public.connections.composio_connected_account_id IS
  'Composio connected account ID. OAuth tokens remain managed by Composio.';

CREATE INDEX idx_connections_client_id
  ON public.connections (client_id);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY connections_select_own
  ON public.connections
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY connections_insert_own
  ON public.connections
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY connections_update_own
  ON public.connections
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY connections_delete_own
  ON public.connections
  FOR DELETE
  USING (client_id = public.get_my_client_id());

CREATE OR REPLACE FUNCTION public.update_connections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_connections_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_connections_updated_at();

CREATE OR REPLACE FUNCTION public.get_system_reminder_context(
  p_client_id UUID,
  p_thread_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'display_name', c.display_name,
    'user_email', u.email,
    'days_since_signup', EXTRACT(DAY FROM now() - c.created_at)::int,
    'open_todo_count', (
      SELECT count(*)::int
      FROM public.agent_todo AS t
      WHERE t.client_id = p_client_id
        AND t.thread_id = p_thread_id
    ),
    'memory_file_count', (
      SELECT count(*)::int
      FROM storage.objects AS o
      WHERE o.bucket_id = 'agent-files'
        AND (
          o.name = p_client_id::text || '/SOUL.md'
          OR o.name = p_client_id::text || '/USER.md'
          OR o.name = p_client_id::text || '/MEMORY.md'
          OR o.name LIKE p_client_id::text || '/memory/%.md'
        )
    ),
    'active_trigger_count', (
      SELECT count(*)::int
      FROM public.agent_triggers AS tr
      WHERE tr.client_id = p_client_id
        AND tr.enabled = true
        AND tr.trigger_type != 'pulse'
    ),
    'active_connection_toolkits', (
      SELECT coalesce(jsonb_agg(conn.toolkit_slug ORDER BY conn.toolkit_slug), '[]'::jsonb)
      FROM public.connections AS conn
      WHERE conn.client_id = p_client_id
        AND conn.status = 'active'
    )
  )
  FROM public.clients AS c
  JOIN auth.users AS u ON u.id = c.user_id
  WHERE c.client_id = p_client_id
    AND (
      auth.role() = 'service_role'
      OR p_client_id = public.get_my_client_id()
    );
$$;

COMMENT ON FUNCTION public.get_system_reminder_context(UUID, UUID) IS
  'Builds per-turn system reminder context for the authenticated client/thread or service-role runs.';
