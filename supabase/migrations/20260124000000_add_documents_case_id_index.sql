-- Add index on documents.case_id for faster case-based queries
-- This column is queried frequently (case page loads, polling during processing)
-- Without index: full table scan. With index: B-tree lookup.

CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
