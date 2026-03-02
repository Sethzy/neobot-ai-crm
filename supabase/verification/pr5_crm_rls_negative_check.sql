-- PR5 verification: assertive negative RLS checks for CRM tables.
-- This script intentionally raises exceptions when expected visibility is violated.
-- Run with elevated privileges in a safe validation environment.

BEGIN;

-- Use a deterministic test marker and clean up prior runs before seeding.
DELETE FROM public.interactions WHERE summary = 'RLSCHK_ASSERTIVE summary';
DELETE FROM public.crm_tasks WHERE title = 'RLSCHK_ASSERTIVE task';
DELETE FROM public.deals WHERE address = 'RLSCHK_ASSERTIVE address';
DELETE FROM public.contacts
WHERE first_name = 'RLSCHK_ASSERTIVE' AND last_name = 'Visibility';

WITH seed_contact AS (
  INSERT INTO public.contacts (client_id, first_name, last_name, type)
  SELECT client_id, 'RLSCHK_ASSERTIVE', 'Visibility', 'buyer'
  FROM public.clients
  ORDER BY created_at ASC
  LIMIT 1
  RETURNING client_id, contact_id
), seed_deal AS (
  INSERT INTO public.deals (client_id, address, stage, contact_id)
  SELECT client_id, 'RLSCHK_ASSERTIVE address', 'leads', contact_id
  FROM seed_contact
  RETURNING client_id, contact_id, deal_id
), seed_interaction AS (
  INSERT INTO public.interactions (client_id, contact_id, deal_id, type, summary, occurred_at)
  SELECT client_id, contact_id, deal_id, 'note', 'RLSCHK_ASSERTIVE summary', now()
  FROM seed_deal
  RETURNING interaction_id
)
INSERT INTO public.crm_tasks (client_id, contact_id, deal_id, title, status)
SELECT d.client_id, d.contact_id, d.deal_id, 'RLSCHK_ASSERTIVE task', 'open'
FROM seed_deal AS d;

-- Superuser visibility should include all seeded rows.
DO $$
DECLARE
  v_contacts INTEGER;
  v_deals INTEGER;
  v_interactions INTEGER;
  v_tasks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_contacts
  FROM public.contacts
  WHERE first_name = 'RLSCHK_ASSERTIVE' AND last_name = 'Visibility';

  SELECT COUNT(*) INTO v_deals
  FROM public.deals
  WHERE address = 'RLSCHK_ASSERTIVE address';

  SELECT COUNT(*) INTO v_interactions
  FROM public.interactions
  WHERE summary = 'RLSCHK_ASSERTIVE summary';

  SELECT COUNT(*) INTO v_tasks
  FROM public.crm_tasks
  WHERE title = 'RLSCHK_ASSERTIVE task';

  IF v_contacts <> 1 OR v_deals <> 1 OR v_interactions <> 1 OR v_tasks <> 1 THEN
    RAISE EXCEPTION
      'Unexpected superuser visibility. contacts=%, deals=%, interactions=%, tasks=%',
      v_contacts, v_deals, v_interactions, v_tasks;
  END IF;
END $$;

-- Anon should not see any CRM rows.
SET role anon;
DO $$
DECLARE
  v_contacts INTEGER;
  v_deals INTEGER;
  v_interactions INTEGER;
  v_tasks INTEGER;
  v_config INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_contacts FROM public.contacts;
  SELECT COUNT(*) INTO v_deals FROM public.deals;
  SELECT COUNT(*) INTO v_interactions FROM public.interactions;
  SELECT COUNT(*) INTO v_tasks FROM public.crm_tasks;
  SELECT COUNT(*) INTO v_config FROM public.crm_config;

  IF v_contacts <> 0 OR v_deals <> 0 OR v_interactions <> 0 OR v_tasks <> 0 OR v_config <> 0 THEN
    RAISE EXCEPTION
      'Anon visibility violation. contacts=%, deals=%, interactions=%, tasks=%, config=%',
      v_contacts, v_deals, v_interactions, v_tasks, v_config;
  END IF;
END $$;
RESET role;

-- Authenticated session without JWT should not see any CRM rows.
SET role authenticated;
DO $$
DECLARE
  v_contacts INTEGER;
  v_deals INTEGER;
  v_interactions INTEGER;
  v_tasks INTEGER;
  v_config INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_contacts FROM public.contacts;
  SELECT COUNT(*) INTO v_deals FROM public.deals;
  SELECT COUNT(*) INTO v_interactions FROM public.interactions;
  SELECT COUNT(*) INTO v_tasks FROM public.crm_tasks;
  SELECT COUNT(*) INTO v_config FROM public.crm_config;

  IF v_contacts <> 0 OR v_deals <> 0 OR v_interactions <> 0 OR v_tasks <> 0 OR v_config <> 0 THEN
    RAISE EXCEPTION
      'Authenticated(no JWT) visibility violation. contacts=%, deals=%, interactions=%, tasks=%, config=%',
      v_contacts, v_deals, v_interactions, v_tasks, v_config;
  END IF;
END $$;
RESET role;

-- Cleanup and assert no leftovers.
DELETE FROM public.interactions WHERE summary = 'RLSCHK_ASSERTIVE summary';
DELETE FROM public.crm_tasks WHERE title = 'RLSCHK_ASSERTIVE task';
DELETE FROM public.deals WHERE address = 'RLSCHK_ASSERTIVE address';
DELETE FROM public.contacts
WHERE first_name = 'RLSCHK_ASSERTIVE' AND last_name = 'Visibility';

DO $$
DECLARE
  v_contacts INTEGER;
  v_deals INTEGER;
  v_interactions INTEGER;
  v_tasks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_contacts
  FROM public.contacts
  WHERE first_name = 'RLSCHK_ASSERTIVE' AND last_name = 'Visibility';

  SELECT COUNT(*) INTO v_deals
  FROM public.deals
  WHERE address = 'RLSCHK_ASSERTIVE address';

  SELECT COUNT(*) INTO v_interactions
  FROM public.interactions
  WHERE summary = 'RLSCHK_ASSERTIVE summary';

  SELECT COUNT(*) INTO v_tasks
  FROM public.crm_tasks
  WHERE title = 'RLSCHK_ASSERTIVE task';

  IF v_contacts <> 0 OR v_deals <> 0 OR v_interactions <> 0 OR v_tasks <> 0 THEN
    RAISE EXCEPTION
      'Cleanup failed. contacts=%, deals=%, interactions=%, tasks=%',
      v_contacts, v_deals, v_interactions, v_tasks;
  END IF;
END $$;

COMMIT;
