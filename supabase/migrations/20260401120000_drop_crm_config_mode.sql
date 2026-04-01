-- Drop obsolete CRM configuration mode state; configure_crm now uses approval gating.
ALTER TABLE public.clients
DROP COLUMN IF EXISTS crm_config_mode_until;
