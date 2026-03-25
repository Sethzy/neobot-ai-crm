-- PR55: General sandbox escape hatch — Phase A migration
-- 1. Drop thread_id unique constraint (per-client lookup, not per-thread)
-- 2. Add client_id index for new lookup pattern
-- 3. Dedupe idle orphan sessions per client (keep most recent)
-- 4. No unique index on client_id yet (Phase B, after old jobs drain)

-- Step 1: Drop the thread_id unique constraint
ALTER TABLE public.sprite_sessions DROP CONSTRAINT IF EXISTS sprite_sessions_thread_unique;

-- Step 2: Add index for per-client lookup (ORDER BY last_active_at DESC)
CREATE INDEX IF NOT EXISTS idx_sprite_sessions_client_active
  ON public.sprite_sessions (client_id, last_active_at DESC)
  WHERE status != 'destroyed';

-- Step 3: Dedupe idle orphan sessions per client
-- For each client with multiple non-destroyed sessions, keep the most recent
-- and mark the rest as destroyed. Skip sessions with active jobs.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT id, client_id, sprite_name, last_active_at,
           ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY last_active_at DESC) AS rn
    FROM public.sprite_sessions
    WHERE status != 'destroyed'
  )
  LOOP
    IF r.rn > 1 THEN
      -- Only mark as destroyed if no active jobs on this sprite
      IF NOT EXISTS (
        SELECT 1 FROM public.sprite_jobs
        WHERE sprite_name = r.sprite_name
        AND status IN ('starting', 'running')
      ) THEN
        UPDATE public.sprite_sessions
        SET status = 'destroyed', destroyed_at = NOW()
        WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.sprite_sessions IS 'Per-client persistent Sprite sessions (PR55). Phase A: lookup by client_id ORDER BY last_active_at DESC LIMIT 1. Phase B (follow-up): add unique index on client_id.';
