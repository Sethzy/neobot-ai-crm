-- PR10: Cross-table command menu search RPC.

CREATE OR REPLACE FUNCTION public.search_records(query text)
RETURNS TABLE (
  type text,
  id uuid,
  title text,
  subtitle text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      trim(coalesce(query, '')) AS q,
      public.get_my_client_id() AS client_id
  )
  SELECT * FROM (
    SELECT
      'contact'::text AS type,
      contacts.contact_id AS id,
      trim(contacts.first_name || ' ' || contacts.last_name) AS title,
      coalesce(contacts.type::text, '') AS subtitle
    FROM public.contacts AS contacts
    JOIN params ON contacts.client_id = params.client_id
    WHERE params.q <> ''
      AND (
        contacts.first_name ILIKE '%' || params.q || '%'
        OR contacts.last_name ILIKE '%' || params.q || '%'
      )
    ORDER BY contacts.updated_at DESC
    LIMIT 3
  ) AS contact_results

  UNION ALL

  SELECT * FROM (
    SELECT
      'deal'::text AS type,
      deals.deal_id AS id,
      deals.address AS title,
      coalesce(deals.stage::text, '') AS subtitle
    FROM public.deals AS deals
    JOIN params ON deals.client_id = params.client_id
    WHERE params.q <> ''
      AND deals.address ILIKE '%' || params.q || '%'
    ORDER BY deals.updated_at DESC
    LIMIT 3
  ) AS deal_results

  UNION ALL

  SELECT * FROM (
    SELECT
      'task'::text AS type,
      crm_tasks.task_id AS id,
      crm_tasks.title AS title,
      coalesce(crm_tasks.status::text, '') AS subtitle
    FROM public.crm_tasks AS crm_tasks
    JOIN params ON crm_tasks.client_id = params.client_id
    WHERE params.q <> ''
      AND crm_tasks.title ILIKE '%' || params.q || '%'
    ORDER BY crm_tasks.updated_at DESC
    LIMIT 3
  ) AS task_results

  UNION ALL

  SELECT * FROM (
    SELECT
      'thread'::text AS type,
      threads.thread_id AS id,
      coalesce(threads.title, 'Untitled thread') AS title,
      ''::text AS subtitle
    FROM public.conversation_threads AS threads
    JOIN params ON threads.client_id = params.client_id
    WHERE params.q <> ''
      AND threads.is_archived = false
      AND coalesce(threads.title, '') ILIKE '%' || params.q || '%'
    ORDER BY threads.updated_at DESC
    LIMIT 3
  ) AS thread_results;
$$;

COMMENT ON FUNCTION public.search_records(text)
IS 'Returns top matches across contacts, deals, tasks, and threads for the current client.';
