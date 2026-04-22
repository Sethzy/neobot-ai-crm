ALTER TABLE public.conversation_threads
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

COMMENT ON COLUMN public.conversation_threads.last_read_at IS
  'When the user last viewed the thread. Null means the thread has never been opened.';
