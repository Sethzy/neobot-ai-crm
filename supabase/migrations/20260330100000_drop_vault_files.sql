-- PR60: Remove the Knowledge Base metadata table.
-- Supersedes PR12a. Replaced by Google Drive via Composio.

DROP TABLE IF EXISTS public.vault_files CASCADE;

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
      ('agent_todo')
  ) AS c(table_name);
$$;
