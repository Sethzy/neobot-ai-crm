-- PR 18: Scheduled agent trigger definitions and state.
-- Decision refs: TRIG-01, TRIG-02, TRIG-04.

CREATE TABLE public.agent_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'schedule'
    CHECK (trigger_type IN ('schedule', 'webhook', 'rss')),
  name TEXT NOT NULL,
  cron_expression TEXT,
  instruction_path TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  current_run_id UUID,
  next_fire_at TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,
  last_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_triggers_schedule_fields_check CHECK (
    trigger_type <> 'schedule'
    OR (cron_expression IS NOT NULL AND next_fire_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.agent_triggers IS
  'Persisted agent trigger definitions and runtime claim state.';
COMMENT ON COLUMN public.agent_triggers.instruction_path IS
  'Path to the persisted instructions or SOP the agent should read when the trigger fires.';
COMMENT ON COLUMN public.agent_triggers.current_run_id IS
  'Atomic dispatch claim token set by the cron scanner while a trigger is in-flight.';

CREATE INDEX idx_agent_triggers_scanner
  ON public.agent_triggers (next_fire_at)
  WHERE enabled = true
    AND current_run_id IS NULL
    AND next_fire_at IS NOT NULL;

CREATE INDEX idx_agent_triggers_client_id
  ON public.agent_triggers (client_id);

CREATE INDEX idx_agent_triggers_thread_id
  ON public.agent_triggers (thread_id);

ALTER TABLE public.agent_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_triggers_select_own
  ON public.agent_triggers
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY agent_triggers_insert_own
  ON public.agent_triggers
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY agent_triggers_update_own
  ON public.agent_triggers
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY agent_triggers_delete_own
  ON public.agent_triggers
  FOR DELETE
  USING (client_id = public.get_my_client_id());

CREATE OR REPLACE FUNCTION public.update_agent_triggers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_triggers_updated_at
  BEFORE UPDATE ON public.agent_triggers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agent_triggers_updated_at();
