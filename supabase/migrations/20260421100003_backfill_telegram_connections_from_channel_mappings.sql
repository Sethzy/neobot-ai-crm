-- PR??: backfill user-scoped Telegram ownership from legacy transport mappings.

INSERT INTO public.messaging_channel_connections (
  user_id,
  client_id,
  channel,
  external_conversation_id,
  target_thread_id
)
SELECT
  clients.user_id,
  mappings.client_id,
  mappings.channel,
  mappings.external_conversation_id,
  mappings.thread_id
FROM public.conversation_channel_mappings AS mappings
JOIN public.clients AS clients
  ON clients.client_id = mappings.client_id
WHERE mappings.channel = 'telegram'
ON CONFLICT (user_id, channel)
DO UPDATE
SET
  client_id = EXCLUDED.client_id,
  external_conversation_id = EXCLUDED.external_conversation_id,
  target_thread_id = EXCLUDED.target_thread_id,
  updated_at = now();

INSERT INTO public.user_profiles (
  id,
  default_messaging_thread_id
)
SELECT
  clients.user_id,
  mappings.thread_id
FROM public.conversation_channel_mappings AS mappings
JOIN public.clients AS clients
  ON clients.client_id = mappings.client_id
WHERE mappings.channel = 'telegram'
ON CONFLICT (id)
DO UPDATE
SET default_messaging_thread_id = COALESCE(
  public.user_profiles.default_messaging_thread_id,
  EXCLUDED.default_messaging_thread_id
);
