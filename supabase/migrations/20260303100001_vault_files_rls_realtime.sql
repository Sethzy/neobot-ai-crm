-- PR12a: RLS + Realtime for vault_files (DATA-03, DATA-07).

ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vault_files_select_own ON public.vault_files;
DROP POLICY IF EXISTS vault_files_insert_own ON public.vault_files;
DROP POLICY IF EXISTS vault_files_update_own ON public.vault_files;
DROP POLICY IF EXISTS vault_files_delete_own ON public.vault_files;

CREATE POLICY vault_files_select_own ON public.vault_files
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY vault_files_insert_own ON public.vault_files
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY vault_files_update_own ON public.vault_files
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY vault_files_delete_own ON public.vault_files
  FOR DELETE USING (client_id = public.get_my_client_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'vault_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_files;
  END IF;
END $$;
