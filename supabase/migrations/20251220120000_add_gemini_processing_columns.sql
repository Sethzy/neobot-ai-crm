-- Migration: Add Gemini document processing columns
-- Description: Adds columns to store Gemini API analysis results
-- Run: Apply via Supabase Dashboard SQL Editor or `supabase db push`

-- Add columns for Gemini document processing results
ALTER TABLE documents ADD COLUMN IF NOT EXISTS renamed_filename TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS primary_tag TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_heterogeneous BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_ranges JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_quality TEXT DEFAULT 'unknown';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_poor_pages INTEGER[];
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS gemini_response JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Add check constraint for valid status values
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('uploaded', 'processing', 'complete', 'failed'));

-- Add check constraint for valid ocr_quality values
ALTER TABLE documents ADD CONSTRAINT documents_ocr_quality_check
  CHECK (ocr_quality IN ('unknown', 'good', 'poor'));

-- Add check constraint for valid primary_tag values
ALTER TABLE documents ADD CONSTRAINT documents_primary_tag_check
  CHECK (primary_tag IS NULL OR primary_tag IN (
    'invoices', 'reports', 'contracts', 'images', 'correspondence', 'miscellaneous'
  ));

-- Add comments for documentation
COMMENT ON COLUMN documents.renamed_filename IS 'AI-generated standardized filename (DD_MM_YYYY_description.ext)';
COMMENT ON COLUMN documents.primary_tag IS 'Primary document classification tag';
COMMENT ON COLUMN documents.is_heterogeneous IS 'True if document contains multiple distinct document types';
COMMENT ON COLUMN documents.page_ranges IS 'JSON array of {start, end, tag, description} for PDFs';
COMMENT ON COLUMN documents.ocr_quality IS 'Overall OCR readability: unknown, good, or poor';
COMMENT ON COLUMN documents.ocr_poor_pages IS 'Array of page numbers with poor text quality';
COMMENT ON COLUMN documents.processing_error IS 'Human-readable error message if processing failed';
COMMENT ON COLUMN documents.gemini_response IS 'Raw Gemini API response for debugging';
COMMENT ON COLUMN documents.processed_at IS 'Timestamp when Gemini processing completed';
