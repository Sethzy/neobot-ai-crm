-- PR-F: allow text attachment MIME types and common charset variants.
-- Supabase Storage compares bucket MIME allowlists against the upload
-- content-type string. Keep the exact variants aligned with browser Blob
-- output while attach_file_to_record normalizes copied record attachments.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/csv;charset=utf-8',
  'text/csv; charset=utf-8',
  'text/plain',
  'text/plain;charset=utf-8',
  'text/plain; charset=utf-8',
  'text/markdown',
  'text/markdown;charset=utf-8',
  'text/markdown; charset=utf-8',
  'text/html',
  'text/xml',
  'application/json',
  'application/json;charset=utf-8',
  'application/json; charset=utf-8',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a'
]::text[]
WHERE id = 'agent-files';
