-- PR20: add retry_count, webhook_secret, and invocation_message to agent_triggers.
-- Supports retry policy tracking, optional webhook HMAC validation, and Tasklet-style invocation titles.

ALTER TABLE public.agent_triggers
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS invocation_message TEXT;

ALTER TABLE public.agent_triggers
  DROP CONSTRAINT IF EXISTS agent_triggers_invocation_message_length;

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_invocation_message_length
  CHECK (invocation_message IS NULL OR length(invocation_message) <= 200);

COMMENT ON COLUMN public.agent_triggers.retry_count IS
  'Consecutive failed attempts for retry-managed triggers. Reset to 0 on success.';

COMMENT ON COLUMN public.agent_triggers.webhook_secret IS
  'Optional HMAC-SHA256 secret used to verify inbound webhook signatures.';

COMMENT ON COLUMN public.agent_triggers.invocation_message IS
  'Optional short trigger title shown to the agent when this trigger fires. Max 200 chars.';
