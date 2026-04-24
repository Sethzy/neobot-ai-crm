-- Drop legacy crm_views columns now that the JSONB `state` is the single source
-- of truth for saved-workspace filters, sort, and default flag.

ALTER TABLE public.crm_views
  DROP COLUMN IF EXISTS filters,
  DROP COLUMN IF EXISTS sort,
  DROP COLUMN IF EXISTS is_default;
