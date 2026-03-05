-- PR15: SQL helper functions for run_agent_memory_sql and get_agent_db_schema tools.
-- Decision refs: TOOL-02, RUNNER-09.

-- run_readonly_sql: Executes single-statement SELECT/CTE SQL with RLS enforced.
-- SECURITY INVOKER means the function runs as the calling user, so RLS policies apply.
CREATE OR REPLACE FUNCTION public.run_readonly_sql(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET statement_timeout = '10s'
AS $$
DECLARE
  result JSONB;
  normalized_query TEXT;
BEGIN
  normalized_query := btrim(query_text);

  IF normalized_query = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  IF normalized_query ~ ';' THEN
    RAISE EXCEPTION 'Only single-statement queries are allowed';
  END IF;

  IF normalized_query !~* '^(select|with)\s' THEN
    RAISE EXCEPTION 'Only SELECT/CTE queries are allowed';
  END IF;

  SET LOCAL transaction_read_only = on;

  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', normalized_query)
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.run_readonly_sql(TEXT) IS
  'Executes single-statement read-only SQL as calling user (RLS enforced). 10s timeout.';


CREATE OR REPLACE FUNCTION public.get_client_accessible_schema()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'table', c.table_name,
      'row_count', CASE c.table_name
        WHEN 'contacts' THEN (SELECT count(*)::int FROM public.contacts)
        WHEN 'deals' THEN (SELECT count(*)::int FROM public.deals)
        WHEN 'deal_contacts' THEN (SELECT count(*)::int FROM public.deal_contacts)
        WHEN 'interactions' THEN (SELECT count(*)::int FROM public.interactions)
        WHEN 'crm_tasks' THEN (SELECT count(*)::int FROM public.crm_tasks)
        WHEN 'crm_config' THEN (SELECT count(*)::int FROM public.crm_config)
        WHEN 'conversation_threads' THEN (SELECT count(*)::int FROM public.conversation_threads)
        WHEN 'conversation_messages' THEN (SELECT count(*)::int FROM public.conversation_messages)
        WHEN 'agent_todo' THEN (SELECT count(*)::int FROM public.agent_todo)
        WHEN 'vault_files' THEN (SELECT count(*)::int FROM public.vault_files)
      END,
      'columns', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', col.column_name,
            'type', col.data_type,
            'nullable', col.is_nullable
          )
          ORDER BY col.ordinal_position
        )
        FROM information_schema.columns AS col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.table_name
      )
    )
    ORDER BY c.table_name
  )
  FROM (
    VALUES
      ('contacts'),
      ('deals'),
      ('deal_contacts'),
      ('interactions'),
      ('crm_tasks'),
      ('crm_config'),
      ('conversation_threads'),
      ('conversation_messages'),
      ('agent_todo'),
      ('vault_files')
  ) AS c(table_name);
$$;

COMMENT ON FUNCTION public.get_client_accessible_schema() IS
  'Returns curated schema metadata (including row counts) for agent-queryable tables.';


-- System-reminder context in a single RPC call.
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
    )
  )
  FROM public.clients AS c
  JOIN auth.users AS u ON u.id = c.user_id
  WHERE c.client_id = p_client_id
    AND p_client_id = public.get_my_client_id();
$$;

COMMENT ON FUNCTION public.get_system_reminder_context(UUID, UUID) IS
  'Builds per-turn system reminder context for the authenticated client/thread.';
