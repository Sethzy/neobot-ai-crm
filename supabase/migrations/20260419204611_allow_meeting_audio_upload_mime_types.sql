-- PR: allow meeting recorder audio MIME types in the shared agent-files bucket.
-- Keep the explicit upload allowlist aligned with the meeting recorder route.

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
  'text/plain',
  'text/plain; charset=utf-8',
  'text/markdown',
  'text/html',
  'text/xml',
  'application/json',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a'
]::text[]
WHERE id = 'agent-files';
