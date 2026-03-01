-- PR3: conversation_messages schema.
-- Message inserts bump thread updated_at to keep recency ordering reliable.

CREATE TABLE public.conversation_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT,
  parts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.bump_thread_updated_at_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversation_threads
  SET updated_at = now()
  WHERE thread_id = NEW.thread_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bump_thread_updated_at_on_message_insert
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_thread_updated_at_on_message_insert();

CREATE INDEX idx_conversation_messages_thread_id
  ON public.conversation_messages(thread_id);

CREATE INDEX idx_conversation_messages_thread_created_at
  ON public.conversation_messages(thread_id, created_at);

COMMENT ON TABLE public.conversation_messages IS 'Append-only messages stored per conversation thread.';
