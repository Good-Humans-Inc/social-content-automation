-- Add video_url column to post_logs table for storing Supabase Storage video URLs
-- This allows videos to be stored temporarily in Supabase Storage and viewed from the dashboard

ALTER TABLE post_logs 
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add index for faster queries when filtering by video_url
CREATE INDEX IF NOT EXISTS idx_post_logs_video_url ON post_logs(video_url) WHERE video_url IS NOT NULL;
