-- Drop the retired legacy docgen data model and dependent nullable references.
-- This removes the old cases/documents/splits/report_history product slice.

DROP INDEX IF EXISTS idx_user_instructions_case_id;

ALTER TABLE IF EXISTS user_instructions
  DROP COLUMN IF EXISTS case_id;

ALTER TABLE IF EXISTS whatsapp_messages
  DROP COLUMN IF EXISTS case_id,
  DROP COLUMN IF EXISTS document_id;

DROP VIEW IF EXISTS documents_with_status;

DROP TABLE IF EXISTS report_history;
DROP TABLE IF EXISTS splits;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS cases;
