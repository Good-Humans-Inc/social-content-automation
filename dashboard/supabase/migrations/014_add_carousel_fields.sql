-- Add carousel_type and grid_images columns to templates table
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS carousel_type TEXT,
ADD COLUMN IF NOT EXISTS grid_images INTEGER;

-- Add index for carousel_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_templates_carousel_type ON templates(carousel_type);
