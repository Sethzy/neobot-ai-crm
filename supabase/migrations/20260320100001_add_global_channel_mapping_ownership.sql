-- PR41: One external conversation can only belong to one client globally.

ALTER TABLE public.conversation_channel_mappings
  ADD CONSTRAINT conversation_channel_mappings_channel_external_global_key
  UNIQUE (channel, external_conversation_id);
