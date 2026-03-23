-- PR52: track one persistent Sprite per thread for sandbox execution.

CREATE TABLE public.sprite_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  sprite_name text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'sleeping', 'destroyed')),
  preview_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  destroyed_at timestamptz,
  CONSTRAINT sprite_sessions_thread_unique UNIQUE (thread_id)
);

CREATE INDEX idx_sprite_sessions_thread
  ON public.sprite_sessions (thread_id)
  WHERE status != 'destroyed';

ALTER TABLE public.sprite_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sprite_sessions_select_own ON public.sprite_sessions
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY sprite_sessions_insert_own ON public.sprite_sessions
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY sprite_sessions_update_own ON public.sprite_sessions
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY sprite_sessions_delete_own ON public.sprite_sessions
  FOR DELETE
  USING (client_id = public.get_my_client_id());
