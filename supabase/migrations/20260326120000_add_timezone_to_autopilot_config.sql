-- Add per-client timezone to autopilot_config.
-- Nullable — NULL falls back to Asia/Singapore in application code.

ALTER TABLE public.autopilot_config
  ADD COLUMN timezone TEXT;

COMMENT ON COLUMN public.autopilot_config.timezone IS
  'IANA timezone for quiet-hours evaluation. Auto-detected from browser, user-overridable. NULL = Asia/Singapore.';
