-- Single combined logs table: post_logs holds all activity (video, warmup, etc.)
-- Add task_id to link to GeeLark task detail
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS task_id TEXT;

-- Add nullable columns for warmup (and other) task types so everything lives in post_logs
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS env_id TEXT;
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS cloud_phone_id TEXT;
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS plan_name TEXT;
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- post_type already exists; use 'video' | 'slideshow' | 'warmup' etc.
-- scheduled_time and error_message are reused for warmup (schedule_at, message)

CREATE INDEX IF NOT EXISTS idx_post_logs_task_id ON post_logs(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_logs_post_type ON post_logs(post_type);
