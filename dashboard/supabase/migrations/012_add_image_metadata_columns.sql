-- Add image metadata columns to assets table if they don't exist
-- These columns store processed image information (dimensions, hash, aspect ratio)

ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS width INTEGER,
ADD COLUMN IF NOT EXISTS height INTEGER,
ADD COLUMN IF NOT EXISTS aspect_ratio NUMERIC(10, 4),
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Add index for file_hash to enable fast duplicate detection
CREATE INDEX IF NOT EXISTS idx_assets_file_hash ON assets(file_hash);

-- Add index for aspect_ratio to enable filtering by image dimensions
CREATE INDEX IF NOT EXISTS idx_assets_aspect_ratio ON assets(aspect_ratio);
