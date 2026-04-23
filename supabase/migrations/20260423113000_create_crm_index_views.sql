-- Add flat CRM read views for agent/reporting queries and expose them through
-- get_client_accessible_schema().

CREATE OR REPLACE VIEW public.crm_contacts_index_v
WITH (security_invoker = on)
AS
SELECT
  contacts.contact_id,
  contacts.client_id,
  contacts.company_id,
  contacts.first_name,
  contacts.last_name,
  concat_ws(' ', contacts.first_name, contacts.last_name) AS full_name,
  contacts.email,
  contacts.phone,
  contacts.type,
  companies.name AS company_name,
  contacts.custom_fields,
  contacts.created_at,
  contacts.updated_at
FROM public.contacts AS contacts
LEFT JOIN public.companies AS companies
  ON companies.company_id = contacts.company_id;

COMMENT ON VIEW public.crm_contacts_index_v IS
  'Flat CRM contacts read surface for run_sql and agent reporting.';


CREATE OR REPLACE VIEW public.crm_companies_index_v
WITH (security_invoker = on)
AS
SELECT
  companies.company_id,
  companies.client_id,
  companies.name,
  companies.industry,
  companies.website,
  companies.phone,
  companies.email,
  companies.address,
  companies.custom_fields,
  companies.created_at,
  companies.updated_at,
  (
    SELECT count(*)::int
    FROM public.contacts
    WHERE contacts.company_id = companies.company_id
  ) AS contact_count,
  (
    SELECT count(*)::int
    FROM public.deals
    WHERE deals.company_id = companies.company_id
  ) AS deal_count
FROM public.companies AS companies;

COMMENT ON VIEW public.crm_companies_index_v IS
  'Flat CRM companies read surface with lightweight related counts.';


CREATE OR REPLACE VIEW public.crm_deals_index_v
WITH (security_invoker = on)
AS
SELECT
  deals.deal_id,
  deals.client_id,
  deals.company_id,
  deals.address,
  deals.stage,
  deals.amount,
  deals.custom_fields,
  deals.created_at,
  deals.updated_at,
  companies.name AS company_name,
  primary_contact.contact_id AS primary_contact_id,
  CASE
    WHEN contacts.contact_id IS NULL THEN NULL
    ELSE concat_ws(' ', contacts.first_name, contacts.last_name)
  END AS primary_contact_name
FROM public.deals AS deals
LEFT JOIN public.companies AS companies
  ON companies.company_id = deals.company_id
LEFT JOIN LATERAL (
  SELECT
    deal_contacts.contact_id
  FROM public.deal_contacts
  WHERE deal_contacts.deal_id = deals.deal_id
  ORDER BY deal_contacts.is_primary DESC, deal_contacts.created_at ASC
  LIMIT 1
) AS primary_contact
  ON TRUE
LEFT JOIN public.contacts AS contacts
  ON contacts.contact_id = primary_contact.contact_id;

COMMENT ON VIEW public.crm_deals_index_v IS
  'Flat CRM deals read surface with company and primary-contact labels.';


CREATE OR REPLACE VIEW public.crm_tasks_index_v
WITH (security_invoker = on)
AS
SELECT
  crm_tasks.task_id,
  crm_tasks.client_id,
  crm_tasks.contact_id,
  crm_tasks.deal_id,
  crm_tasks.title,
  crm_tasks.description,
  crm_tasks.status,
  crm_tasks.due_date,
  crm_tasks.custom_fields,
  crm_tasks.created_at,
  crm_tasks.updated_at,
  CASE
    WHEN contacts.contact_id IS NULL THEN NULL
    ELSE concat_ws(' ', contacts.first_name, contacts.last_name)
  END AS contact_name,
  deals.address AS deal_address,
  COALESCE(deals.company_id, contacts.company_id) AS company_id,
  companies.name AS company_name
FROM public.crm_tasks
LEFT JOIN public.contacts
  ON contacts.contact_id = crm_tasks.contact_id
LEFT JOIN public.deals
  ON deals.deal_id = crm_tasks.deal_id
LEFT JOIN public.companies
  ON companies.company_id = COALESCE(deals.company_id, contacts.company_id);

COMMENT ON VIEW public.crm_tasks_index_v IS
  'Flat CRM tasks read surface with related contact, deal, and company labels.';


CREATE OR REPLACE FUNCTION public.get_client_accessible_schema()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH curated(table_name) AS (
    VALUES
      ('agent_todo'),
      ('companies'),
      ('contacts'),
      ('conversation_messages'),
      ('conversation_threads'),
      ('crm_companies_index_v'),
      ('crm_config'),
      ('crm_contacts_index_v'),
      ('crm_deals_index_v'),
      ('crm_tasks'),
      ('crm_tasks_index_v'),
      ('deal_contacts'),
      ('deals'),
      ('interactions'),
      ('vault_files')
  ),
  relations AS (
    SELECT
      pg_class.oid,
      pg_class.relkind,
      pg_class.relname AS table_name
    FROM pg_class
    JOIN pg_namespace
      ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'table', curated.table_name,
      'row_count', CASE
        WHEN relations.relkind = 'r' THEN COALESCE(pg_stat_get_live_tuples(relations.oid), 0)::int
        ELSE NULL
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
          AND col.table_name = curated.table_name
      )
    )
    ORDER BY curated.table_name
  )
  FROM curated
  LEFT JOIN relations
    ON relations.table_name = curated.table_name;
$$;

COMMENT ON FUNCTION public.get_client_accessible_schema() IS
  'Returns curated schema metadata (including row counts) for agent-queryable tables and CRM read views.';
