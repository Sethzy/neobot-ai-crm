-- PR3: runs table and run_status enum (RUNNER-08).

DO $$
BEGIN
  CREATE TYPE public.run_status AS ENUM (
    'queued',
    'running',
    'completed',
    'partial',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE public.runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  status public.run_status NOT NULL DEFAULT 'queued',
  model TEXT,
  tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_runs_thread_id
  ON public.runs(thread_id);

CREATE INDEX idx_runs_client_id
  ON public.runs(client_id);

CREATE INDEX idx_runs_active_by_thread
  ON public.runs(thread_id)
  WHERE status IN ('queued', 'running');

COMMENT ON TABLE public.runs IS 'Execution runs per thread.';
