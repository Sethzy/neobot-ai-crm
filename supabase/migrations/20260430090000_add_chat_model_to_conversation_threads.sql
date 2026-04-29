-- Lock the chat model to the thread.
--
-- Anthropic Managed Agents pin a session to one agent ID per model, so a
-- thread is already implicitly tied to one model via its session_id. We
-- store the user-selected model on the thread row to make that explicit
-- and to stop the chat route from trusting client-sent model fields after
-- a thread has been created.

ALTER TABLE public.conversation_threads
  ADD COLUMN IF NOT EXISTS chat_model TEXT NOT NULL
    DEFAULT 'anthropic/claude-sonnet-4-6';

COMMENT ON COLUMN public.conversation_threads.chat_model IS
  'User-selected chat model for this thread. Captured at thread create '
  'time and immutable for the life of the thread. Reads here are the '
  'source of truth for /api/chat — the client picker only seeds new '
  'threads, never mutates existing ones.';
