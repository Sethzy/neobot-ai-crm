-- PR A: cut Telegram over to the client primary thread only.
-- Repoints all Telegram routing state, clears stranded pending questions,
-- prevents future multi-user Telegram fan-out per client, and drops the
-- reverted user-level thread override column.

SET LOCAL lock_timeout = '5s';

WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
),
drifted_mappings AS (
  SELECT mappings.external_conversation_id AS chat_id
  FROM public.conversation_channel_mappings AS mappings
  JOIN primary_threads
    ON primary_threads.client_id = mappings.client_id
  WHERE mappings.channel = 'telegram'
    AND mappings.thread_id <> primary_threads.primary_thread_id
)
DELETE FROM public.telegram_pending_questions AS pending
USING drifted_mappings
WHERE pending.chat_id = drifted_mappings.chat_id;

WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
)
UPDATE public.conversation_channel_mappings AS mappings
SET thread_id = primary_threads.primary_thread_id
FROM primary_threads
WHERE mappings.channel = 'telegram'
  AND mappings.client_id = primary_threads.client_id
  AND mappings.thread_id <> primary_threads.primary_thread_id;

WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
)
UPDATE public.messaging_channel_connections AS connections
SET target_thread_id = primary_threads.primary_thread_id
FROM primary_threads
WHERE connections.channel = 'telegram'
  AND connections.client_id = primary_threads.client_id
  AND connections.target_thread_id <> primary_threads.primary_thread_id;

WITH primary_threads AS (
  SELECT client_id, thread_id AS primary_thread_id
  FROM public.conversation_threads
  WHERE is_primary = true
)
UPDATE public.telegram_pairing_sessions AS sessions
SET target_thread_id = primary_threads.primary_thread_id
FROM primary_threads
WHERE sessions.client_id = primary_threads.client_id
  AND sessions.consumed_at IS NULL
  AND sessions.target_thread_id <> primary_threads.primary_thread_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messaging_channel_connections_client_telegram_unique
  ON public.messaging_channel_connections (client_id)
  WHERE channel = 'telegram';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_default_messaging_thread_id_fkey;

DROP INDEX IF EXISTS public.idx_user_profiles_default_messaging_thread_id;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS default_messaging_thread_id;
