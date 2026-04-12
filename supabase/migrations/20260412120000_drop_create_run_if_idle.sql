-- Drop the create_run_if_idle RPC.
-- The session transport uses plain inserts via createRunRecord(); the
-- per-thread idle lock is no longer needed.
drop function if exists public.create_run_if_idle(uuid, uuid, text);
