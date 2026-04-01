-- Configurable CRM Columns: seed field definition arrays for existing crm_config rows.
-- Existing rows that don't have *_fields arrays get default field arrays.
-- Custom fields from *_custom_fields are appended as tier: "custom" entries.
-- Old *_custom_fields columns are left intact (harmless, cleaned up later).
--
-- This migration is safe to re-run — it only updates rows where the fields arrays are NULL.

-- Add the field array JSONB columns to crm_config if they don't exist yet
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS contact_fields jsonb,
  ADD COLUMN IF NOT EXISTS company_fields jsonb,
  ADD COLUMN IF NOT EXISTS deal_fields jsonb;

COMMENT ON COLUMN public.crm_config.contact_fields IS 'Unified field definitions for contacts (FieldDefinition[])';
COMMENT ON COLUMN public.crm_config.company_fields IS 'Unified field definitions for companies (FieldDefinition[])';
COMMENT ON COLUMN public.crm_config.deal_fields IS 'Unified field definitions for deals (FieldDefinition[])';

-- NOTE: The actual data migration (reading existing custom fields and appending them
-- to the default field arrays) is handled at the application level by resolveCrmConfig().
-- When contact_fields/company_fields/deal_fields are NULL, resolveCrmConfig() returns
-- the default field arrays automatically. When the user next configures fields via the
-- agent or UI, the full array will be written to the DB.
--
-- This approach avoids complex PL/pgSQL JSON manipulation and lets the TypeScript
-- parsing/validation handle the migration naturally.
