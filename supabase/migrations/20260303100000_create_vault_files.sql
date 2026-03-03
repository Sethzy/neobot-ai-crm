-- PR12a: Knowledge Base metadata table (SERVICE-02, DATA-09).
-- Stores vault file metadata and searchable text content. Blobs live in Supabase Storage.

CREATE TABLE public.vault_files (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  content TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT,
  needs_reprocess BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT vault_files_client_path_unique UNIQUE (client_id, storage_path),
  CONSTRAINT vault_files_filename_non_empty CHECK (length(trim(filename)) > 0),
  CONSTRAINT vault_files_title_non_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT vault_files_storage_path_non_empty CHECK (length(trim(storage_path)) > 0),
  CONSTRAINT vault_files_storage_path_vault_prefix CHECK (storage_path LIKE 'vault/%'),
  CONSTRAINT vault_files_size_non_negative CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

-- Tenant and list-page query paths.
CREATE INDEX idx_vault_files_client_id ON public.vault_files(client_id);
CREATE INDEX idx_vault_files_client_updated_at ON public.vault_files(client_id, updated_at DESC);

-- Full-text search across title, filename, summary, and extracted/raw text content.
ALTER TABLE public.vault_files
  ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(filename, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

CREATE INDEX idx_vault_files_fts ON public.vault_files USING gin(fts);

-- Auto-update updated_at on row changes.
CREATE TRIGGER update_vault_files_updated_at
  BEFORE UPDATE ON public.vault_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.vault_files IS 'Knowledge Base file metadata. Blobs in Supabase Storage under /{clientId}/vault/.';
COMMENT ON COLUMN public.vault_files.storage_path IS 'Workspace-relative path inside client workspace, e.g. vault/floor-plan.pdf';
COMMENT ON COLUMN public.vault_files.content IS 'Extracted or raw text used for SQL discovery and search.';
COMMENT ON COLUMN public.vault_files.needs_reprocess IS 'True when metadata enrichment (summary/tags/embeddings) should be regenerated asynchronously.';
COMMENT ON COLUMN public.vault_files.fts IS 'Generated tsvector for full-text search across title, filename, summary, and content.';
