-- PR 19: autopilot_config table for per-client pulse settings.
-- Decision refs: TRIG-07, TRIG-09.

CREATE TABLE public.autopilot_config (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(client_id) ON DELETE CASCADE,
  pulse_interval TEXT NOT NULL DEFAULT '6h'
    CHECK (pulse_interval IN ('1h', '2h', '6h', '12h')),
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT autopilot_config_quiet_hours_check CHECK (
    (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
    OR (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
  )
);

COMMENT ON TABLE public.autopilot_config IS
  'Per-client autopilot pulse cadence, quiet-hours window, and enabled state.';

ALTER TABLE public.autopilot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY autopilot_config_select_own
  ON public.autopilot_config
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY autopilot_config_update_own
  ON public.autopilot_config
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE OR REPLACE FUNCTION public.update_autopilot_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_autopilot_config_updated_at
  BEFORE UPDATE ON public.autopilot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_autopilot_config_updated_at();
