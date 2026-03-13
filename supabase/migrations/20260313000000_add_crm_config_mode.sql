-- PR48: Add time-limited CRM configuration mode flag to clients.
-- null = config mode off, timestamptz = config mode active until that time.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS crm_config_mode_until timestamptz;

COMMENT ON COLUMN public.clients.crm_config_mode_until IS
  'When set and in the future, configure_crm tool is available in normal chat. Auto-expires. Set from Settings UI.';
