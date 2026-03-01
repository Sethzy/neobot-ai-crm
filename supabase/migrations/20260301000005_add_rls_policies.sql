-- PR3: RLS policies for clients, conversation threads/messages, and runs.
-- DATA-03 ownership model: resolve auth user to client_id then scope by client_id.

CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT client_id
  FROM public.clients
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

COMMENT ON FUNCTION public.get_my_client_id() IS 'Resolves current auth user to client_id.';

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;

CREATE POLICY clients_select_own ON public.clients
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY clients_update_own ON public.clients
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_threads FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_threads_select_own ON public.conversation_threads
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY conversation_threads_insert_own ON public.conversation_threads
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY conversation_threads_update_own ON public.conversation_threads
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY conversation_threads_delete_own ON public.conversation_threads
  FOR DELETE
  USING (client_id = public.get_my_client_id());

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_messages_select_own ON public.conversation_messages
  FOR SELECT
  USING (
    thread_id IN (
      SELECT thread_id
      FROM public.conversation_threads
      WHERE client_id = public.get_my_client_id()
    )
  );

CREATE POLICY conversation_messages_insert_own ON public.conversation_messages
  FOR INSERT
  WITH CHECK (
    thread_id IN (
      SELECT thread_id
      FROM public.conversation_threads
      WHERE client_id = public.get_my_client_id()
    )
  );

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs FORCE ROW LEVEL SECURITY;

CREATE POLICY runs_select_own ON public.runs
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY runs_insert_own ON public.runs
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY runs_update_own ON public.runs
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());
