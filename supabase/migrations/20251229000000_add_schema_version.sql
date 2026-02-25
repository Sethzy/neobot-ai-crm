-- Add schema_version column to splits table
-- Tracks which codebase schema version was used for extraction.
-- NULL for legacy records pre-dating code-first workflow.
ALTER TABLE splits ADD COLUMN schema_version TEXT;
