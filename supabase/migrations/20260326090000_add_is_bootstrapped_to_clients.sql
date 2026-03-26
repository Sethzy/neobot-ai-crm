-- Extract bootstrap from context assembly: durable initialization flag.
-- Replaces process-local Set<string> cache that evaporates on serverless cold starts.
ALTER TABLE public.clients
  ADD COLUMN is_bootstrapped BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.is_bootstrapped IS
  'True after client storage (memory files + skills) has been initialized. Checked once per chat turn to skip bootstrap.';
