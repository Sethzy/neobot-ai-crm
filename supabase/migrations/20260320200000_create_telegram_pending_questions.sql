-- PR42: Persisted pending question batches for Telegram callbacks and text replies.

CREATE TABLE public.telegram_pending_questions (
  token text PRIMARY KEY,
  client_id uuid NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id uuid NOT NULL
    REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  chat_id text NOT NULL UNIQUE,
  questions jsonb NOT NULL DEFAULT '[]',
  answers jsonb NOT NULL DEFAULT '[]',
  current_index integer NOT NULL DEFAULT 0,
  awaiting_text_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_pending_questions_chat_id
  ON public.telegram_pending_questions(chat_id);

CREATE INDEX idx_telegram_pending_questions_chat_awaiting
  ON public.telegram_pending_questions(chat_id)
  WHERE awaiting_text_reply = true;

COMMENT ON TABLE public.telegram_pending_questions IS
  'Short-lived pending question batches for Telegram. Rows are advanced on answer and cleared on completion, /new, or disconnect.';

ALTER TABLE public.telegram_pending_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_pending_questions_select_own
  ON public.telegram_pending_questions
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY telegram_pending_questions_insert_own
  ON public.telegram_pending_questions
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY telegram_pending_questions_update_own
  ON public.telegram_pending_questions
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY telegram_pending_questions_delete_own
  ON public.telegram_pending_questions
  FOR DELETE
  USING (client_id = public.get_my_client_id());
