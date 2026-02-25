-- Update report_type check constraint to match current app types
ALTER TABLE report_history DROP CONSTRAINT IF EXISTS report_history_report_type_check;

ALTER TABLE report_history ADD CONSTRAINT report_history_report_type_check
  CHECK (report_type IN ('quick_report', 'ai_analysis', 'data_export', 'ai_summary', 'ai_reconciliation', 'ai_custom'));
