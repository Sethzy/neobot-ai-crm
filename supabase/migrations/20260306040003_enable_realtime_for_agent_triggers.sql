-- PR20: include agent_triggers in the shared Supabase Realtime publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_triggers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_triggers;
  END IF;
END $$;
