-- PR7: agent-files storage bucket and tenant-scoped RLS.
-- Decisions: DATA-02, DATA-04, DATA-05, TOOL-03.
-- No file versioning in v1 (DATA-05).

-- Create private bucket for agent operational files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-files', 'agent-files', false)
ON CONFLICT (id) DO NOTHING;

-- Replace policies to keep migration idempotent when re-applied in local/dev.
DROP POLICY IF EXISTS "agent_files_select_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "agent_files_insert_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "agent_files_update_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "agent_files_delete_own_prefix" ON storage.objects;

-- Users can only read objects inside /{client_id}/...
CREATE POLICY "agent_files_select_own_prefix"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'agent-files'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );

-- Users can only create objects inside /{client_id}/...
CREATE POLICY "agent_files_insert_own_prefix"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'agent-files'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );

-- Users can only update objects inside /{client_id}/...
CREATE POLICY "agent_files_update_own_prefix"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'agent-files'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  )
  WITH CHECK (
    bucket_id = 'agent-files'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );

-- Users can only delete objects inside /{client_id}/...
CREATE POLICY "agent_files_delete_own_prefix"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'agent-files'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );
