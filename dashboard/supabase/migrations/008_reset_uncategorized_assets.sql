-- Reset uncategorized assets to allow reprocessing with description-based categorization
-- This clears file_hash, category, subcategory, and dimensions so they can be reprocessed

UPDATE assets
SET 
  file_hash = NULL,
  category = NULL,
  subcategory = NULL,
  width = NULL,
  height = NULL,
  aspect_ratio = NULL
WHERE category = 'uncategorized';

-- To reset ALL processed assets (use with caution):
-- UPDATE assets
-- SET 
--   file_hash = NULL,
--   category = NULL,
--   subcategory = NULL,
--   width = NULL,
--   height = NULL,
--   aspect_ratio = NULL
-- WHERE file_hash IS NOT NULL;
