-- PR3: conversation_threads schema (SESSION-01).

CREATE TABLE public.conversation_threads (
  thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  title TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_conversation_threads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_conversation_threads_updated_at
  BEFORE UPDATE ON public.conversation_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_conversation_threads_updated_at();

CREATE INDEX idx_conversation_threads_client_id
  ON public.conversation_threads(client_id);

CREATE INDEX idx_conversation_threads_updated_at_desc
  ON public.conversation_threads(updated_at DESC);

COMMENT ON TABLE public.conversation_threads IS 'Per-client conversation threads.';
