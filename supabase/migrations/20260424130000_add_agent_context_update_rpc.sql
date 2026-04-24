-- H5 follow-up: restore a narrow write path to clients.client_profile /
-- clients.user_preferences for the Personality settings page.
--
-- Background: migration 20260301000006_harden_clients_rls dropped the
-- clients UPDATE policy so user-scoped code could not touch the row.
-- Migration 20260410100000_managed_agents_foundation then added the
-- editable columns but never re-introduced a write path. The settings
-- PUT handler has been silently failing since: .update() runs with an
-- auth-scoped client, RLS filters it to zero rows, and .single() errors
-- with PGRST116 ("The result contains 0 rows").
--
-- Fix: a SECURITY DEFINER RPC that hard-codes the only two columns the
-- authenticated user is ever allowed to write. Sensitive columns
-- (plan_tier, stripe_customer_id, user_id, …) stay unreachable from
-- browser-side Supabase calls because the clients table remains
-- read-only via RLS.

CREATE OR REPLACE FUNCTION public.update_my_agent_context(
  p_client_profile text DEFAULT NULL,
  p_user_preferences text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_profile text;
  v_user_preferences text;
BEGIN
  UPDATE public.clients
  SET
    client_profile = COALESCE(p_client_profile, client_profile),
    user_preferences = COALESCE(p_user_preferences, user_preferences)
  WHERE user_id = auth.uid()
  RETURNING client_profile, user_preferences
  INTO v_client_profile, v_user_preferences;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No clients row for the current auth user.';
  END IF;

  RETURN jsonb_build_object(
    'client_profile', v_client_profile,
    'user_preferences', v_user_preferences
  );
END;
$$;

COMMENT ON FUNCTION public.update_my_agent_context(text, text)
IS 'Updates the current client''s agent personality fields. The only user-reachable write path to public.clients; RLS otherwise keeps the row read-only.';

REVOKE ALL ON FUNCTION public.update_my_agent_context(text, text)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_agent_context(text, text) TO authenticated;
