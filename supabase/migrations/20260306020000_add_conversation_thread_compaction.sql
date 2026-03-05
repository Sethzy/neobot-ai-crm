-- PR22: thread-level context compaction state.
-- Stores the latest rolled-forward summary on the thread row.
-- Source conversation_messages rows are never deleted.

ALTER TABLE public.conversation_threads
  ADD COLUMN IF NOT EXISTS compaction_summary TEXT,
  ADD COLUMN IF NOT EXISTS compaction_compacted_through_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS compaction_compacted_through_message_id UUID,
  ADD COLUMN IF NOT EXISTS compaction_summary_model TEXT,
  ADD COLUMN IF NOT EXISTS compaction_summary_tokens_used INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_threads_compaction_state_consistent'
  ) THEN
    ALTER TABLE public.conversation_threads
      ADD CONSTRAINT conversation_threads_compaction_state_consistent CHECK (
        (
          compaction_summary IS NULL
          AND compaction_compacted_through_at IS NULL
          AND compaction_compacted_through_message_id IS NULL
          AND compaction_summary_model IS NULL
          AND compaction_summary_tokens_used = 0
        )
        OR (
          compaction_summary IS NOT NULL
          AND compaction_compacted_through_at IS NOT NULL
          AND compaction_compacted_through_message_id IS NOT NULL
          AND compaction_summary_model IS NOT NULL
          AND compaction_summary_tokens_used >= 0
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.conversation_threads.compaction_summary
  IS 'Latest rolled-forward summary of older thread context. Source messages are never deleted.';
COMMENT ON COLUMN public.conversation_threads.compaction_compacted_through_at
  IS 'Created_at timestamp of the last message folded into compaction_summary.';
COMMENT ON COLUMN public.conversation_threads.compaction_compacted_through_message_id
  IS 'Deterministic cutoff message_id used to break same-timestamp ties at the compaction boundary.';
COMMENT ON COLUMN public.conversation_threads.compaction_summary_model
  IS 'Model used to generate the latest compaction summary.';
COMMENT ON COLUMN public.conversation_threads.compaction_summary_tokens_used
  IS 'Total tokens spent generating the latest compaction summary.';

CREATE OR REPLACE FUNCTION public.set_conversation_threads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  ELSIF NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
    OR NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_conversation_threads_updated_at()
  IS 'Bumps thread updated_at for user-visible thread changes, but ignores compaction-only updates.';
