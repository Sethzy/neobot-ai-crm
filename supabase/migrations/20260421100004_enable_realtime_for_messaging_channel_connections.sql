-- Enable Supabase Realtime publication for messaging_channel_connections so
-- the personal Telegram connect row flips to Connected as soon as the webhook
-- writes the user-owned connection row.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messaging_channel_connections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_channel_connections;
  END IF;
END $$;
