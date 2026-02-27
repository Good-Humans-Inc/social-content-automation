-- Single combined "logs" table for all activity types (video, warmup, carousel, etc.)
-- type: 'video' | 'warmup' | 'carousel' | 'slideshow' | or any future type
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  status TEXT NOT NULL,
  error_message TEXT,
  scheduled_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  task_id TEXT,
  -- optional, used by different types
  template_id TEXT REFERENCES templates(id),
  video_url TEXT,
  resource_url TEXT,
  display_name TEXT,
  env_id TEXT,
  cloud_phone_id TEXT,
  plan_name TEXT,
  action TEXT,
  duration_minutes INTEGER,
  render_path TEXT,
  upload_asset_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);
CREATE INDEX IF NOT EXISTS idx_logs_account_id ON logs(account_id);
CREATE INDEX IF NOT EXISTS idx_logs_status ON logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id) WHERE task_id IS NOT NULL;

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on logs" ON logs FOR ALL USING (true) WITH CHECK (true);
