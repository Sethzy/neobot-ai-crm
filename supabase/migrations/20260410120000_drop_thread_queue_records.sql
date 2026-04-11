-- Managed Agents H4: remove the legacy per-thread queue infrastructure.
-- Session state now serializes turns, so the queue table and drain RPC
-- are no longer used after the atomic cutover.
BEGIN;

DROP FUNCTION IF EXISTS public.drain_thread_queue(uuid, uuid);

DROP TABLE IF EXISTS public.thread_queue_records CASCADE;

COMMIT;
