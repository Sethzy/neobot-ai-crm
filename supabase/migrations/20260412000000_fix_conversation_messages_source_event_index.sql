-- Fix: make the (thread_id, source_event_id) unique index usable as an
-- ON CONFLICT arbiter for supabase-js .upsert() calls.
--
-- The managed-agents foundation migration (20260410100000) created this
-- index as a PARTIAL unique index with `WHERE source_event_id IS NOT NULL`.
-- Postgres will only infer a partial unique index as an arbiter when the
-- statement also restates the index predicate via
-- `ON CONFLICT (cols) WHERE predicate`. supabase-js / PostgREST's
-- `onConflict` parameter only passes column names, so inference fails with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- and every call to upsertMessage() (adapter.persistUserInput /
-- persistAssistantOutput, finalize-trigger-run) returns 500.
--
-- Every application caller of upsertMessage() passes a non-null
-- source_event_id (the type requires it), so the partial predicate is a
-- tautology. Replace it with a full unique index on the same columns.
-- Under the default NULLS DISTINCT semantics, pre-cutover rows with NULL
-- source_event_id remain allowed and remain distinct from each other, so
-- the behavioral surface is identical for existing data.

DROP INDEX IF EXISTS public.uq_conversation_messages_thread_source_event;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_messages_thread_source_event
  ON public.conversation_messages (thread_id, source_event_id);
