-- PR 70: Meetings Surface
-- Add title and summary columns, allow meetings without threads, and add the
-- summarizing status for synchronous auto-summary generation.

ALTER TABLE public.meeting_records
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT;

UPDATE public.meeting_records
SET status = 'transcribed'
WHERE status = 'processing';

ALTER TABLE public.meeting_records
  ALTER COLUMN thread_id DROP NOT NULL;

ALTER TABLE public.meeting_records
  DROP CONSTRAINT IF EXISTS meeting_records_status_check;

ALTER TABLE public.meeting_records
  ADD CONSTRAINT meeting_records_status_check
  CHECK (status IN ('uploaded', 'transcribing', 'transcribed', 'summarizing', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_meeting_records_client_created
  ON public.meeting_records (client_id, created_at DESC);

COMMENT ON COLUMN public.meeting_records.title IS 'Auto-generated meeting title from LLM summary';
COMMENT ON COLUMN public.meeting_records.summary IS 'Auto-generated markdown bullet-point summary';
