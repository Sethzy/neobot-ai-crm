-- PR50b: store Browser-Use profile mappings for authenticated browsing.
-- Decision refs: SERVICE-12.

CREATE TABLE public.browser_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  browser_use_profile_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT browser_profiles_client_platform_unique UNIQUE (client_id, platform)
);

COMMENT ON TABLE public.browser_profiles IS
  'Maps a client and platform slug to a Browser-Use Cloud profile for persistent authenticated browsing.';
COMMENT ON COLUMN public.browser_profiles.platform IS
  'Normalized platform slug, for example propnex, propertyguru, ura, hdb, or srx.';
COMMENT ON COLUMN public.browser_profiles.browser_use_profile_id IS
  'Opaque Browser-Use Cloud profile ID created and managed by Browser-Use.';

CREATE INDEX idx_browser_profiles_client_id
  ON public.browser_profiles (client_id);

ALTER TABLE public.browser_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY browser_profiles_select_own
  ON public.browser_profiles
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY browser_profiles_insert_own
  ON public.browser_profiles
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY browser_profiles_update_own
  ON public.browser_profiles
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY browser_profiles_delete_own
  ON public.browser_profiles
  FOR DELETE
  USING (client_id = public.get_my_client_id());

CREATE TRIGGER trg_browser_profiles_updated_at
  BEFORE UPDATE ON public.browser_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_connections_updated_at();
