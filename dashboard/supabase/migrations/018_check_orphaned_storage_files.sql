-- Check for potential orphaned files in storage bucket
-- This query helps identify patterns that might indicate orphaned files
-- Note: This cannot directly query storage, but helps identify database records
-- that might be missing, which could indicate orphaned files in storage

-- 1. Check for storage_paths in database that follow the correct pattern
-- This helps identify what paths SHOULD exist in storage
SELECT 
    COUNT(*) as total_assets_with_storage_path,
    COUNT(DISTINCT category) as unique_categories,
    COUNT(DISTINCT subcategory) as unique_subcategories
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%';

-- 2. Find assets with storage_path but potentially missing files
-- (This would need to be cross-referenced with actual storage listing)
SELECT 
    category,
    subcategory,
    COUNT(*) as asset_count,
    MIN(created_at) as oldest_asset,
    MAX(created_at) as newest_asset
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
GROUP BY category, subcategory
ORDER BY asset_count DESC;

-- 3. Check for storage_paths that don't match the expected pattern
-- These might indicate files that exist in storage but aren't properly tracked
SELECT 
    id,
    storage_path,
    category,
    subcategory,
    created_at,
    'Path pattern mismatch' as issue_type
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND (
    -- Path should have exactly 4 parts: assets/category/subcategory/filename
    array_length(string_to_array(storage_path, '/'), 1) != 4
    OR storage_path NOT LIKE CONCAT('assets/', COALESCE(category, ''), '/%')
  )
ORDER BY created_at DESC;

-- 4. Summary: Get all unique storage paths that should exist
-- Use this list to compare against actual storage bucket contents
SELECT DISTINCT
    storage_path,
    category,
    subcategory
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND array_length(string_to_array(storage_path, '/'), 1) = 4
ORDER BY category, subcategory, storage_path;

-- 5. Count files by category/subcategory for reference
SELECT 
    category,
    subcategory,
    COUNT(*) as file_count
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND array_length(string_to_array(storage_path, '/'), 1) = 4
GROUP BY category, subcategory
ORDER BY file_count DESC;
