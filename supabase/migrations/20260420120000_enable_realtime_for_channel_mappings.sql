-- Enable Supabase Realtime publication for conversation_channel_mappings so the
-- browser can flip the Telegram connect row to "Connected" the moment the webhook
-- writes the mapping on /start. Without this, client subscriptions accept the
-- WebSocket but never receive INSERT/DELETE events for this table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_channel_mappings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_channel_mappings;
  END IF;
END $$;
