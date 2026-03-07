-- PR 15c: CRM configurability — dynamic vocabulary + custom fields
-- Decision refs: TOOL-08, RUNNER-09, DATA-01, DATA-09.

-- Step A: Drop static CHECK constraints so configurable fields accept dynamic values.
-- Validation moves to app layer (tool schemas + UI).
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_type_check;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE public.interactions DROP CONSTRAINT IF EXISTS interactions_type_check;
ALTER TABLE public.deal_contacts DROP CONSTRAINT IF EXISTS deal_contacts_role_check;

-- Step B: Normalize legacy object-array config data to string[].
-- Existing rows store [{id, name, color}, ...] — extract id values to plain strings.
UPDATE public.crm_config
SET deal_stages = (
  SELECT jsonb_agg(elem->>'id')
  FROM jsonb_array_elements(deal_stages) AS elem
)
WHERE deal_stages IS NOT NULL
  AND jsonb_typeof(deal_stages) = 'array'
  AND jsonb_array_length(deal_stages) > 0
  AND jsonb_typeof(deal_stages->0) = 'object';

UPDATE public.crm_config
SET interaction_types = (
  SELECT jsonb_agg(elem->>'id')
  FROM jsonb_array_elements(interaction_types) AS elem
)
WHERE interaction_types IS NOT NULL
  AND jsonb_typeof(interaction_types) = 'array'
  AND jsonb_array_length(interaction_types) > 0
  AND jsonb_typeof(interaction_types->0) = 'object';

UPDATE public.crm_config
SET task_types = (
  SELECT jsonb_agg(elem->>'id')
  FROM jsonb_array_elements(task_types) AS elem
)
WHERE task_types IS NOT NULL
  AND jsonb_typeof(task_types) = 'array'
  AND jsonb_array_length(task_types) > 0
  AND jsonb_typeof(task_types->0) = 'object';

-- Step C: Extend crm_config with additional vocabulary columns.
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS contact_types JSONB,
  ADD COLUMN IF NOT EXISTS deal_contact_roles JSONB,
  ADD COLUMN IF NOT EXISTS deal_label TEXT NOT NULL DEFAULT 'Deal';

-- Step D: Add custom field definition columns to crm_config.
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS deal_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS task_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Step E: Add custom field value columns to CRM entity tables.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
