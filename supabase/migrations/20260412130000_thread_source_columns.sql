-- Mark threads with their origin: user chat or automation run.
ALTER TABLE conversation_threads
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN source_trigger_id UUID REFERENCES agent_triggers(id) ON DELETE SET NULL,
  ADD COLUMN source_run_id UUID;

-- Fast lookups for "all run threads for this automation"
CREATE INDEX idx_threads_source_trigger
  ON conversation_threads(source_trigger_id)
  WHERE source_type = 'automation_run';

-- RLS note: conversation_threads RLS is scoped by client_id.
-- Run threads inherit the same client_id as the trigger owner.
-- Existing policies cover reads/writes — no new RLS needed.
