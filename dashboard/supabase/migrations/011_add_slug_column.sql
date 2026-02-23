-- Add slug column to assets table for organizing assets into collections
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Add index for efficient filtering by slug
CREATE INDEX IF NOT EXISTS idx_assets_slug ON assets(slug);

-- Add composite index for category, subcategory, and slug queries
CREATE INDEX IF NOT EXISTS idx_assets_category_subcategory_slug ON assets(category, subcategory, slug);
