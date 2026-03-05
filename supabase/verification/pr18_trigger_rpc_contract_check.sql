-- PR 18 verification: agent_triggers schema + RPC contracts.
-- Run against a local reset database after applying PR 18 migrations.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'agent_triggers';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'agent_triggers'
ORDER BY ordinal_position;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'agent_triggers'
ORDER BY indexname;

SELECT proname, pg_get_function_result(oid) AS result_signature
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'claim_due_triggers',
    'release_stale_trigger_claims',
    'release_trigger_claim'
  )
ORDER BY proname;
