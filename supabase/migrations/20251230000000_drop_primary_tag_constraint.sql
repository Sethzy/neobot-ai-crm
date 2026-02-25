-- Migration: Drop hardcoded primary_tag constraint
-- Description: Removes documents_primary_tag_check constraint which only allowed
-- default tag IDs. Per-client configs now use dynamic tag IDs (e.g., medical_expense).
-- The constraint prevents these dynamic tags from being stored.
--
-- Context: Constraint was created in 20251220120000 before per-client configs.
-- Now that tag IDs are defined per-client in src/config/clients/*.ts,
-- the database cannot enforce a static list of allowed values.
--
-- Note: splits.tag_id (created in 20251225000000) already uses unconstrained TEXT.

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_primary_tag_check;
