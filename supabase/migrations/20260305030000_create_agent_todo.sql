-- PR15: agent_todo table for agent scratchpad / notes-to-future-self.
-- Decision refs: TOOL-02, RUNNER-09.
-- Binary state: rows exist or are deleted. No status lifecycle.
-- Thread-scoped: each todo belongs to a specific conversation thread.

CREATE TABLE public.agent_todo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_todo_thread ON public.agent_todo(thread_id);
CREATE INDEX idx_agent_todo_client ON public.agent_todo(client_id);

ALTER TABLE public.agent_todo ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_todo_select_own ON public.agent_todo
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY agent_todo_insert_own ON public.agent_todo
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY agent_todo_update_own ON public.agent_todo
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY agent_todo_delete_own ON public.agent_todo
  FOR DELETE
  USING (client_id = public.get_my_client_id());
