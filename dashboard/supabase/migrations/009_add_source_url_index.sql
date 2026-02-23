-- Add index on metadata->>'source_url' for efficient duplicate detection
-- This allows fast lookups when checking if an image with the same source URL already exists
CREATE INDEX IF NOT EXISTS idx_assets_source_url ON assets((metadata->>'source_url'))
WHERE metadata->>'source_url' IS NOT NULL;
