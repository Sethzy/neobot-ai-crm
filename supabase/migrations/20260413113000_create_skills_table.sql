-- Skills metadata table used for discovery, install state, and slash-command
-- autocomplete. Skill content lives on Anthropic (predefined bundles) and in
-- Supabase Storage for user overrides.

CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(client_id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_predefined BOOLEAN NOT NULL DEFAULT false,
  forked_from TEXT,
  is_installed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skills_unique_per_client UNIQUE (client_id, slug)
);

CREATE UNIQUE INDEX skills_predefined_unique_slug
  ON public.skills (slug)
  WHERE client_id IS NULL;

CREATE INDEX skills_client_installed
  ON public.skills (client_id)
  WHERE is_installed = true;

CREATE OR REPLACE FUNCTION public.update_skills_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_skills_updated_at();

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY skills_select ON public.skills
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR client_id IS NULL
    OR client_id = public.get_my_client_id()
  );

CREATE POLICY skills_insert ON public.skills
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  );

CREATE POLICY skills_update ON public.skills
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  );

CREATE POLICY skills_delete ON public.skills
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  );

COMMENT ON TABLE public.skills IS
  'Skill metadata for discovery, per-user install state, and skill overrides. Content lives on Anthropic and in Supabase Storage.';
