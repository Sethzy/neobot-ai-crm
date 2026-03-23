-- Add is_primary column to conversation_threads.
-- One primary thread per client (the persistent main session).
ALTER TABLE conversation_threads
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

-- Backfill: derive primary thread from pulse trigger (canonical source),
-- then fall back to title match for clients without a trigger.
UPDATE conversation_threads ct
SET is_primary = true, title = 'Agent'
FROM agent_triggers at
WHERE at.thread_id = ct.thread_id
  AND at.trigger_type = 'pulse';

-- Fallback: title-based match for any remaining unpaired autopilot threads.
UPDATE conversation_threads
SET is_primary = true, title = 'Agent'
WHERE title = 'Sunder Autopilot'
  AND is_pinned = true
  AND is_primary = false;

-- Ensure at most one primary per client (partial unique index).
-- Created AFTER backfill to avoid conflicts during migration.
CREATE UNIQUE INDEX idx_conversation_threads_primary
  ON conversation_threads (client_id)
  WHERE is_primary = true;
