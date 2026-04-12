-- Link runs back to their parent automation and dedicated thread.
ALTER TABLE runs
  ADD COLUMN trigger_id UUID REFERENCES agent_triggers(id) ON DELETE SET NULL,
  ADD COLUMN run_thread_id UUID REFERENCES conversation_threads(thread_id) ON DELETE SET NULL;

-- Fast lookups for "all runs for this automation"
CREATE INDEX idx_runs_trigger_id ON runs(trigger_id) WHERE trigger_id IS NOT NULL;
