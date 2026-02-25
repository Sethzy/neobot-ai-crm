-- Migration: Replace OCR confidence with duplicate detection
-- OCR confidence is redundant (ExtendAI provides per-field ocrConfidence)
-- Duplicate detection within bundles is more useful at splitting stage

-- ============================================================================
-- DOCUMENTS: Replace ocr_confidence with duplicate_status
-- ============================================================================

-- 1. Drop old constraint
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_ocr_confidence_check;

-- 2. Rename column
ALTER TABLE documents RENAME COLUMN ocr_confidence TO duplicate_status;

-- 3. Migrate existing values (all become 'none' since we're changing purpose)
UPDATE documents SET duplicate_status = 'none';

-- 4. Add new constraint (binary: none or detected)
ALTER TABLE documents ADD CONSTRAINT documents_duplicate_status_check
  CHECK (duplicate_status IN ('none', 'detected'));

-- 5. Update default
ALTER TABLE documents ALTER COLUMN duplicate_status SET DEFAULT 'none';

-- 6. Update comment
COMMENT ON COLUMN documents.duplicate_status IS 'Duplicate detection status: none (no duplicates), detected (potential duplicates found within bundle)';

-- ============================================================================
-- SPLITS: Rename ocr_issue to potential_duplicate
-- ============================================================================

ALTER TABLE splits RENAME COLUMN ocr_issue TO potential_duplicate;

COMMENT ON COLUMN splits.potential_duplicate IS 'Description of potential duplicate if detected (e.g., "Duplicate of pages 1-2"), null if no duplicate';
