-- PR22a: public chat-attachments bucket for multimodal chat uploads.
-- Decisions: DATA-02, DATA-04.

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat_attachments_insert_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_update_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete_own_prefix" ON storage.objects;

CREATE POLICY "chat_attachments_insert_own_prefix"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );

CREATE POLICY "chat_attachments_update_own_prefix"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  )
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );

CREATE POLICY "chat_attachments_delete_own_prefix"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );
