-- CRM saved views: named filter+sort presets for CRM list pages.
CREATE TABLE public.crm_views (
  view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contacts', 'companies', 'deals', 'tasks')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort JSONB,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_seeded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: use get_my_client_id() matching all other CRM tables
ALTER TABLE public.crm_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_views_select" ON public.crm_views FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY "crm_views_insert" ON public.crm_views FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY "crm_views_update" ON public.crm_views FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY "crm_views_delete" ON public.crm_views FOR DELETE
  USING (client_id = public.get_my_client_id());

-- Enable realtime for crm_views
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_views;

-- Fast lookup by client + entity
CREATE INDEX idx_crm_views_client_entity ON public.crm_views(client_id, entity_type);

-- Unique name per client per entity
CREATE UNIQUE INDEX idx_crm_views_unique_name ON public.crm_views(client_id, entity_type, name);
