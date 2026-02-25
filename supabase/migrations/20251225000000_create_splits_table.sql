-- ============================================================================
-- SPLITS: Each logical document within a PDF
-- ============================================================================
CREATE TABLE splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  split_index INTEGER NOT NULL,  -- 0-indexed position within document

  -- Page range
  start_page INTEGER NOT NULL,
  end_page INTEGER NOT NULL,

  -- Classification (from Gemini)
  tag_id TEXT NOT NULL,              -- Document tag from Gemini classification
  identifier TEXT,                   -- Document reference number
  document_date DATE,                -- Date found on document
  ocr_issue TEXT,                    -- OCR quality issues noted by Gemini
  observation TEXT,                  -- Gemini's reasoning

  -- Extraction (from ExtendAI)
  extend_processor_id TEXT,          -- Which ExtendAI processor was used
  original_extracted_data JSONB,     -- Immutable snapshot from ExtendAI (for audit/eval)
  extracted_data JSONB,              -- Editable by users
  extraction_metadata JSONB,         -- Per-field: { ocrConfidence, citations }
  extraction_status TEXT DEFAULT 'pending',
  -- 'pending' | 'processing' | 'complete' | 'needs_review' | 'failed'
  extraction_error TEXT,             -- Error message if failed

  -- Validation
  validation_failures JSONB,         -- Array of { ruleId, ruleName, message }
  low_confidence_fields JSONB,       -- Array of { field, ocrConfidence }

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(document_id, split_index),
  CHECK (start_page > 0),
  CHECK (end_page >= start_page)
);

-- Indexes for common queries
CREATE INDEX idx_splits_document ON splits(document_id);
CREATE INDEX idx_splits_status ON splits(extraction_status);
CREATE INDEX idx_splits_needs_review ON splits(extraction_status) WHERE extraction_status = 'needs_review';
CREATE INDEX idx_splits_tag ON splits(tag_id);

-- ============================================================================
-- RLS: Users can only access splits for documents in their cases
-- ============================================================================
ALTER TABLE splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their splits" ON splits
  FOR SELECT USING (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN cases c ON d.case_id = c.id
      WHERE c.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert their splits" ON splits
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN cases c ON d.case_id = c.id
      WHERE c.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update their splits" ON splits
  FOR UPDATE USING (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN cases c ON d.case_id = c.id
      WHERE c.created_by = auth.uid()
    )
  ) WITH CHECK (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN cases c ON d.case_id = c.id
      WHERE c.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete their splits" ON splits
  FOR DELETE USING (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN cases c ON d.case_id = c.id
      WHERE c.created_by = auth.uid()
    )
  );

-- ============================================================================
-- DOCUMENTS: Add review tracking columns
-- ============================================================================
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ============================================================================
-- VIEW: Computed document status from splits
-- ============================================================================
CREATE OR REPLACE VIEW documents_with_status AS
SELECT
  d.*,
  CASE
    WHEN d.is_reviewed THEN 'reviewed'
    WHEN EXISTS (SELECT 1 FROM splits s WHERE s.document_id = d.id AND s.extraction_status IN ('pending', 'processing')) THEN 'processing'
    -- Only 'failed' if ALL splits failed (no successes)
    WHEN NOT EXISTS (SELECT 1 FROM splits s WHERE s.document_id = d.id AND s.extraction_status IN ('complete', 'needs_review'))
      AND EXISTS (SELECT 1 FROM splits s WHERE s.document_id = d.id AND s.extraction_status = 'failed') THEN 'failed'
    WHEN EXISTS (SELECT 1 FROM splits s WHERE s.document_id = d.id AND s.extraction_status = 'needs_review') THEN 'in_review'
    WHEN EXISTS (SELECT 1 FROM splits s WHERE s.document_id = d.id AND s.extraction_status = 'failed') THEN 'in_review'  -- Partial failure = needs review
    WHEN EXISTS (SELECT 1 FROM splits s WHERE s.document_id = d.id AND s.extraction_status = 'complete') THEN 'processed'
    ELSE d.status  -- Fallback to existing status column for documents without splits
  END as computed_status
FROM documents d;

-- ============================================================================
-- TRIGGER: Update updated_at on splits
-- ============================================================================
CREATE TRIGGER update_splits_updated_at
  BEFORE UPDATE ON splits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
