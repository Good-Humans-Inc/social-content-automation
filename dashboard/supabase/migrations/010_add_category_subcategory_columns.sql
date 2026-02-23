-- Add category and subcategory columns to assets table if they don't exist
-- These columns are used for organizing images into folders

ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_subcategory ON assets(subcategory);
CREATE INDEX IF NOT EXISTS idx_assets_category_subcategory ON assets(category, subcategory);
