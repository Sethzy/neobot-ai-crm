-- EC10: add duration_minutes to interactions so create_interaction can
-- store call/meeting durations alongside summary. Nullable; existing rows
-- continue to work. Validated as 0..1440 at the tool layer.

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER
  CHECK (duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 1440));
