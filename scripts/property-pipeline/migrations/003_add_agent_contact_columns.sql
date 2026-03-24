-- Add contact enrichment columns to cea_agents.
-- These are populated by scraping OpenAgent.sg agent profiles.

ALTER TABLE cea_agents
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_source TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS contact_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cea_agents_mobile
  ON cea_agents (mobile_phone) WHERE mobile_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cea_agents_email
  ON cea_agents (email) WHERE email IS NOT NULL;
