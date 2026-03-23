-- Add is_primary column to conversation_threads.
-- One primary thread per client (the persistent main session).
ALTER TABLE conversation_threads
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

-- Backfill: derive primary thread from pulse trigger (canonical source).
-- Uses DISTINCT ON to pick exactly one thread per client even if multiple
-- pulse triggers exist (defensive — app logic should prevent this).
WITH primary_picks AS (
  SELECT DISTINCT ON (ct.client_id) ct.thread_id
  FROM conversation_threads ct
  JOIN agent_triggers at ON at.thread_id = ct.thread_id
  WHERE at.trigger_type = 'pulse'
  ORDER BY ct.client_id, ct.created_at ASC
)
UPDATE conversation_threads ct
SET is_primary = true, title = 'Agent'
FROM primary_picks pp
WHERE pp.thread_id = ct.thread_id;

-- Fallback: title-based match for any remaining unpaired autopilot threads.
-- Also picks one per client to be safe.
WITH fallback_picks AS (
  SELECT DISTINCT ON (client_id) thread_id
  FROM conversation_threads
  WHERE title = 'Sunder Autopilot'
    AND is_pinned = true
    AND is_primary = false
  ORDER BY client_id, created_at ASC
)
UPDATE conversation_threads ct
SET is_primary = true, title = 'Agent'
FROM fallback_picks fp
WHERE fp.thread_id = ct.thread_id;

-- Ensure at most one primary per client (partial unique index).
-- Created AFTER backfill to avoid conflicts during migration.
CREATE UNIQUE INDEX idx_conversation_threads_primary
  ON conversation_threads (client_id)
  WHERE is_primary = true;
