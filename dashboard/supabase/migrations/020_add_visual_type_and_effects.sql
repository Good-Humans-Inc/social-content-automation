-- Add visual_type, effect_preset, and output_as_slides to video_jobs
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS visual_type TEXT DEFAULT 'A';
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS effect_preset TEXT DEFAULT 'none';
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS output_as_slides BOOLEAN DEFAULT FALSE;

-- Add daily_post_target and intensity_ratio to accounts for daily orchestration
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS daily_post_target INTEGER DEFAULT 2;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intensity_ratio JSONB DEFAULT '{"T0": 0.5, "T1": 0.3, "T2": 0.2}'::jsonb;
