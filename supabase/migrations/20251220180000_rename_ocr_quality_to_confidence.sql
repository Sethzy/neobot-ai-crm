-- Migration: Rename ocr_quality to ocr_confidence with new enum values
-- Changes: good/poor/unknown → high/medium/low

-- 1. Drop old constraint
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_ocr_quality_check;

-- 2. Rename column
ALTER TABLE documents RENAME COLUMN ocr_quality TO ocr_confidence;

-- 3. Migrate existing values
UPDATE documents SET ocr_confidence = CASE
  WHEN ocr_confidence = 'good' THEN 'high'
  WHEN ocr_confidence = 'poor' THEN 'low'
  WHEN ocr_confidence = 'unknown' THEN 'high'
  ELSE 'high'
END;

-- 4. Add new constraint
ALTER TABLE documents ADD CONSTRAINT documents_ocr_confidence_check
  CHECK (ocr_confidence IN ('high', 'medium', 'low'));

-- 5. Update default
ALTER TABLE documents ALTER COLUMN ocr_confidence SET DEFAULT 'high';

-- 6. Update comment
COMMENT ON COLUMN documents.ocr_confidence IS 'OCR confidence level: high (all readable), medium (minor issues), low (significant problems)';
