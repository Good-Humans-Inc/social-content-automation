-- Video generation job queue table
CREATE TABLE video_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id TEXT NOT NULL REFERENCES templates(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  post_type TEXT NOT NULL DEFAULT 'video', -- 'video', 'slideshow', 'carousel'
  
  -- Job parameters
  image_asset_ids UUID[] DEFAULT '{}', -- Array of asset IDs from assets table
  video_source TEXT, -- Optional base video path/URL
  image_duration FLOAT DEFAULT 3.0, -- Duration per image in seconds
  rapid_mode BOOLEAN DEFAULT FALSE, -- Rapid image changes (0.2s per image)
  music_asset_id UUID, -- Optional music/audio asset ID
  character_name TEXT, -- Optional character name for carousels
  carousel_id TEXT, -- Optional carousel ID
  
  -- Job status and tracking
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  progress INTEGER DEFAULT 0, -- 0-100
  logs JSONB DEFAULT '[]', -- Array of log entries: [{timestamp, level, message}]
  error_message TEXT,
  
  -- Results
  video_url TEXT, -- Supabase Storage URL of generated video
  render_path TEXT, -- Local path where video was rendered (for debugging)
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for better query performance
CREATE INDEX idx_video_jobs_status ON video_jobs(status);
CREATE INDEX idx_video_jobs_template_id ON video_jobs(template_id);
CREATE INDEX idx_video_jobs_account_id ON video_jobs(account_id);
CREATE INDEX idx_video_jobs_created_at ON video_jobs(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_video_jobs_updated_at BEFORE UPDATE ON video_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE video_jobs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (can be restricted later with auth)
CREATE POLICY "Allow all operations on video_jobs" ON video_jobs
  FOR ALL USING (true) WITH CHECK (true);
