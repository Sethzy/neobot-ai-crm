-- PR 19: extend agent_triggers for the built-in autopilot pulse.
-- Decision refs: TRIG-07, TRIG-10.

ALTER TABLE public.agent_triggers
  DROP CONSTRAINT IF EXISTS agent_triggers_trigger_type_check;

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_trigger_type_check
    CHECK (trigger_type IN ('schedule', 'webhook', 'rss', 'pulse'));

ALTER TABLE public.agent_triggers
  DROP CONSTRAINT IF EXISTS agent_triggers_schedule_fields_check;

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_schedule_fields_check CHECK (
    trigger_type NOT IN ('schedule', 'pulse')
    OR (cron_expression IS NOT NULL AND next_fire_at IS NOT NULL)
  );

CREATE UNIQUE INDEX idx_agent_triggers_one_pulse_per_client
  ON public.agent_triggers (client_id)
  WHERE trigger_type = 'pulse';
