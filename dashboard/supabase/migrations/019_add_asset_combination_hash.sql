-- Add asset_combination_hash to post_logs for material-combination deduplication
ALTER TABLE post_logs ADD COLUMN IF NOT EXISTS asset_combination_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_post_logs_asset_hash ON post_logs (asset_combination_hash);
