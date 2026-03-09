-- PR34: add pending_approval_count to system reminder context.

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
    'pending_approval_count', (
      SELECT count(*)::int
      FROM public.approval_events AS ae
      WHERE ae.client_id = p_client_id
        AND ae.status = 'pending'
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
  'Builds per-turn system reminder context including pending approval count.';
