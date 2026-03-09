-- PR34: approval_events table for tracking tool approval lifecycle.

CREATE TABLE public.approval_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(client_id),
  thread_id     uuid NOT NULL REFERENCES public.conversation_threads(thread_id),
  run_id        uuid REFERENCES public.runs(run_id),
  tool_name     text NOT NULL,
  tool_input    jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  approval_id   text NOT NULL,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_approval_events_approval_id UNIQUE (client_id, approval_id)
);

ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_events_select"
  ON public.approval_events FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY "approval_events_insert"
  ON public.approval_events FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  );

CREATE POLICY "approval_events_update"
  ON public.approval_events FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE INDEX idx_approval_events_pending
  ON public.approval_events (client_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_approval_events_approval_id
  ON public.approval_events (approval_id);

COMMENT ON TABLE public.approval_events IS
  'Tracks tool approval lifecycle: pending → approved/denied/expired.';
