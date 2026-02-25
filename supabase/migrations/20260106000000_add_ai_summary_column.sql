-- Add ai_summary column to store Claude's text summary of AI reports
-- Nullable: null for data_export and existing reports
ALTER TABLE report_history ADD COLUMN ai_summary text;
