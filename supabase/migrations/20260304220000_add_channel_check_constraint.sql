-- Constrain channel column to known values (web, telegram, whatsapp).
-- Prevents arbitrary free-text values in the channel column.

ALTER TABLE public.conversation_channel_mappings
  ADD CONSTRAINT conversation_channel_mappings_channel_check
  CHECK (channel IN ('web', 'telegram', 'whatsapp'));

ALTER TABLE public.conversation_channel_delivery_receipts
  ADD CONSTRAINT conversation_channel_delivery_receipts_channel_check
  CHECK (channel IN ('web', 'telegram', 'whatsapp'));

-- Also remove the UPDATE RLS policy since mappings are now immutable (first-write-wins).
DROP POLICY IF EXISTS conversation_channel_mappings_update_own
  ON public.conversation_channel_mappings;
