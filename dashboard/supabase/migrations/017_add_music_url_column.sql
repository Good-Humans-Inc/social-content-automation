-- Add music_url column to video_jobs table for external music API URLs
ALTER TABLE video_jobs 
ADD COLUMN music_url TEXT; -- Optional external music/audio URL (from API like Pixabay)

-- Add comment
COMMENT ON COLUMN video_jobs.music_url IS 'Optional external music/audio URL from music API (e.g., Pixabay). Used instead of music_asset_id for on-demand music.';
