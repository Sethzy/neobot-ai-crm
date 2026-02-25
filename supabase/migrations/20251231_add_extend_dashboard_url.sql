-- Add ExtendAI dashboard URL for debugging/tracing
ALTER TABLE splits ADD COLUMN extend_dashboard_url TEXT;

COMMENT ON COLUMN splits.extend_dashboard_url IS 'Link to ExtendAI dashboard for this extraction run';
