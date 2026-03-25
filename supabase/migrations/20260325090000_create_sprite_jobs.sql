-- Async sandbox job state machine
CREATE TABLE sprite_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  sprite_name text NOT NULL,
  job_type text NOT NULL,
  job_meta jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'starting',
  progress_label text,
  result_meta jsonb,
  claimed_at timestamptz,
  claimed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE sprite_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sprite jobs"
  ON sprite_jobs FOR ALL
  USING (client_id = get_my_client_id());

CREATE INDEX idx_sprite_jobs_active
  ON sprite_jobs (status) WHERE status IN ('starting', 'running');

CREATE UNIQUE INDEX idx_sprite_jobs_sprite_active
  ON sprite_jobs (sprite_name) WHERE status IN ('starting', 'running');
