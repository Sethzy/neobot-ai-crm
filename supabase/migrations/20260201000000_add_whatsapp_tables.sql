-- Migration: Add WhatsApp integration tables
-- Purpose: Map phone numbers to users, track message history

-- Table: whatsapp_contacts - Maps phone numbers to users (not clients)
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,  -- E.164 format: '+15551234567'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: whatsapp_messages - Message audit log
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_msg_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact_id UUID REFERENCES whatsapp_contacts(id),
  case_id UUID REFERENCES cases(id),
  document_id UUID REFERENCES documents(id),

  message_type TEXT NOT NULL,  -- 'document' | 'text' | 'image'
  message_text TEXT,
  filename TEXT,

  status TEXT DEFAULT 'received',  -- 'received' | 'processing' | 'complete' | 'failed'
  response_text TEXT,

  whatsapp_timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,

  UNIQUE(phone, whatsapp_msg_id)  -- Deduplication constraint
);

-- Add source tracking to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS whatsapp_message_id UUID REFERENCES whatsapp_messages(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_user ON whatsapp_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);

-- Enable RLS
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users manage their own contacts
CREATE POLICY "Users manage own contacts" ON whatsapp_contacts
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies: Users see messages from their phone numbers
CREATE POLICY "Users see own messages" ON whatsapp_messages
  FOR SELECT USING (
    phone IN (SELECT phone FROM whatsapp_contacts WHERE user_id = auth.uid())
  );

-- Updated_at trigger for whatsapp_contacts
CREATE TRIGGER update_whatsapp_contacts_updated_at
  BEFORE UPDATE ON whatsapp_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
