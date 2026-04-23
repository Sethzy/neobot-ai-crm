-- Upgrade crm_views from legacy filter/sort presets to one richer saved-workspace state object.
-- Keep legacy columns during rollout so existing callers keep working.

ALTER TABLE public.crm_views
ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT jsonb_build_object(
  'version', 1,
  'viewType', 'table',
  'filters', '{}'::jsonb,
  'sort', NULL,
  'columns', '[]'::jsonb,
  'columnOrder', '[]'::jsonb,
  'groupBy', NULL,
  'calendarField', NULL,
  'openMode', 'drawer',
  'isDefault', FALSE
);

UPDATE public.crm_views
SET state = jsonb_build_object(
  'version', 1,
  'viewType', 'table',
  'filters', COALESCE(filters, '{}'::jsonb),
  'sort', sort,
  'columns', '[]'::jsonb,
  'columnOrder', '[]'::jsonb,
  'groupBy', NULL,
  'calendarField', NULL,
  'openMode', 'drawer',
  'isDefault', is_default
);

COMMENT ON COLUMN public.crm_views.state IS
  'Saved CRM workspace state. Includes layout, filters, sort, columns, grouping, calendar field, open mode, and default flag.';
