-- Add validation review completion tracking to cases table
ALTER TABLE cases
ADD COLUMN IF NOT EXISTS validation_review_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS validation_review_completed_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN cases.validation_review_completed_at IS 'Timestamp when user marked validation review as complete';
COMMENT ON COLUMN cases.validation_review_completed_by IS 'User who marked validation review as complete';
