-- PR20: add active_trigger_count to the system reminder context.
-- Preserves the existing auth guard and extends it to allow service_role trigger/autopilot runs.

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
  'Builds per-turn system reminder context for the authenticated client/thread or service-role trigger runs.';
