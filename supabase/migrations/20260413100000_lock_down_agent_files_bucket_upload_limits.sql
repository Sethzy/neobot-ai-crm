-- PR: lock down agent-files uploads with explicit size and MIME restrictions.
-- Keep text/plain; charset=utf-8 allowed so agent memory writes continue to work.

UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
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
    'application/json'
  ]::text[]
WHERE id = 'agent-files';
