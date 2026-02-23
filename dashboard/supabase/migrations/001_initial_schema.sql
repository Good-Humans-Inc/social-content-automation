-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Assets table for scraped images/videos
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  storage_path TEXT,
  fandom TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraping jobs table
CREATE TABLE scraping_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  target_urls TEXT[] DEFAULT '{}',
  progress INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  error_log TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates table
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  persona TEXT NOT NULL,
  fandom TEXT NOT NULL,
  intensity TEXT NOT NULL DEFAULT 'T0', -- T0, T1, T2
  overlay JSONB NOT NULL, -- Array of strings
  caption TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  used JSONB, -- null or {timestamp, account_id, account_display_name, cloud_phone_id, status, error_message}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  env_id TEXT NOT NULL,
  cloud_phone_id TEXT NOT NULL,
  persona TEXT NOT NULL,
  preferred_fandoms TEXT[] DEFAULT '{}',
  preferred_intensity TEXT,
  video_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post logs table
CREATE TABLE post_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id TEXT REFERENCES templates(id),
  account_id TEXT REFERENCES accounts(id),
  post_type TEXT NOT NULL, -- video, slideshow
  status TEXT NOT NULL, -- success, failed
  error_message TEXT,
  scheduled_time TIMESTAMPTZ,
  render_path TEXT,
  upload_asset_id TEXT,
  resource_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posting schedules table
CREATE TABLE posting_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id TEXT UNIQUE REFERENCES accounts(id),
  posts_per_day INTEGER NOT NULL DEFAULT 1, -- 1 or 2
  time_windows JSONB NOT NULL, -- Array of {start: "HH:MM", end: "HH:MM"} in ET
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for assets and templates (many-to-many)
CREATE TABLE asset_templates (
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES templates(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, template_id)
);

-- Indexes for better query performance
CREATE INDEX idx_assets_fandom ON assets(fandom);
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX idx_templates_persona ON templates(persona);
CREATE INDEX idx_templates_fandom ON templates(fandom);
CREATE INDEX idx_templates_intensity ON templates(intensity);
CREATE INDEX idx_templates_used ON templates((used IS NULL));
CREATE INDEX idx_post_logs_account_id ON post_logs(account_id);
CREATE INDEX idx_post_logs_template_id ON post_logs(template_id);
CREATE INDEX idx_post_logs_status ON post_logs(status);
CREATE INDEX idx_post_logs_created_at ON post_logs(created_at);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraping_jobs_updated_at BEFORE UPDATE ON scraping_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posting_schedules_updated_at BEFORE UPDATE ON posting_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_templates ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (can be restricted later with auth)
CREATE POLICY "Allow all operations on assets" ON assets
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on scraping_jobs" ON scraping_jobs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on templates" ON templates
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on accounts" ON accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on post_logs" ON post_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on posting_schedules" ON posting_schedules
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on asset_templates" ON asset_templates
  FOR ALL USING (true) WITH CHECK (true);
