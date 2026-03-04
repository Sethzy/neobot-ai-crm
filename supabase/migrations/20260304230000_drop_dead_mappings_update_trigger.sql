-- Drop the updated_at trigger on conversation_channel_mappings.
-- Mappings are now immutable (first-write-wins, no UPDATE path),
-- so the trigger is unreachable dead code.

DROP TRIGGER IF EXISTS set_conversation_channel_mappings_updated_at
  ON public.conversation_channel_mappings;

DROP FUNCTION IF EXISTS public.set_conversation_channel_mappings_updated_at();
