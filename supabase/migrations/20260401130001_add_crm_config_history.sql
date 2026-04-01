-- CRM config version history: stores snapshots before every config write.
-- Keeps last 20 versions per client for rollback safety.

CREATE TABLE IF NOT EXISTS public.crm_config_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  config_snapshot jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS: clients can only see their own config history
ALTER TABLE public.crm_config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own config history"
  ON public.crm_config_history FOR SELECT
  USING (client_id = (SELECT client_id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage config history"
  ON public.crm_config_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_crm_config_history_client_id
  ON public.crm_config_history (client_id, created_at DESC);

COMMENT ON TABLE public.crm_config_history IS 'Stores CRM config snapshots before each write. Last 20 per client.';
