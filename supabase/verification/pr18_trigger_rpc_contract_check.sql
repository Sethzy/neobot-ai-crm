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

SELECT
  proname,
  pg_get_function_identity_arguments(oid) AS identity_arguments,
  pg_get_function_result(oid) AS result_signature,
  prosecdef AS is_security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'claim_due_triggers',
    'release_stale_trigger_claims',
    'release_trigger_claim'
  )
ORDER BY proname;

SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'claim_due_triggers',
    'release_stale_trigger_claims',
    'release_trigger_claim'
  )
ORDER BY routine_name, grantee, privilege_type;

DO $$
BEGIN
  IF to_regprocedure('public.claim_due_triggers()') IS NULL THEN
    RAISE EXCEPTION 'Missing function public.claim_due_triggers()';
  END IF;

  IF to_regprocedure('public.release_stale_trigger_claims(integer)') IS NULL THEN
    RAISE EXCEPTION 'Missing function public.release_stale_trigger_claims(integer)';
  END IF;

  IF to_regprocedure('public.release_trigger_claim(uuid,uuid,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Missing function public.release_trigger_claim(uuid,uuid,text,timestamptz)';
  END IF;

  IF to_regprocedure('public.release_trigger_claim(uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Old 3-argument release_trigger_claim signature still exists';
  END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.claim_due_triggers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon should not have EXECUTE on claim_due_triggers()';
  END IF;

  IF has_function_privilege('authenticated', 'public.claim_due_triggers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated should not have EXECUTE on claim_due_triggers()';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.claim_due_triggers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must have EXECUTE on claim_due_triggers()';
  END IF;

  IF has_function_privilege('anon', 'public.release_stale_trigger_claims(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon should not have EXECUTE on release_stale_trigger_claims(integer)';
  END IF;

  IF has_function_privilege('authenticated', 'public.release_stale_trigger_claims(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated should not have EXECUTE on release_stale_trigger_claims(integer)';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.release_stale_trigger_claims(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must have EXECUTE on release_stale_trigger_claims(integer)';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.release_trigger_claim(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon should not have EXECUTE on release_trigger_claim(uuid,uuid,text,timestamptz)';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.release_trigger_claim(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated should not have EXECUTE on release_trigger_claim(uuid,uuid,text,timestamptz)';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.release_trigger_claim(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role must have EXECUTE on release_trigger_claim(uuid,uuid,text,timestamptz)';
  END IF;
END
$$;

BEGIN;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.release_stale_trigger_claims(15);
    RAISE EXCEPTION 'authenticated role unexpectedly executed release_stale_trigger_claims';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('service_role' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.release_trigger_claim(gen_random_uuid(), gen_random_uuid(), 'completed', NULL);
    RAISE EXCEPTION 'authenticated role unexpectedly executed release_trigger_claim';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('service_role' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  BEGIN
    PERFORM COUNT(*) FROM public.claim_due_triggers();
    RAISE EXCEPTION 'authenticated role unexpectedly executed claim_due_triggers';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('service_role' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.release_stale_trigger_claims(15);
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.release_trigger_claim(gen_random_uuid(), gen_random_uuid(), 'completed', NULL);
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT COUNT(*) FROM public.claim_due_triggers();
ROLLBACK;
