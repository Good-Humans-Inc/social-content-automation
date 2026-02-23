-- Remove assets with invalid storage paths that don't match current structure
-- Current structure: assets/{category}/{character}/filename.jpg
-- WARNING: This will permanently delete assets from the database
-- Run the check query (015_check_invalid_assets.sql) first to review what will be deleted

-- 1. Delete assets with double "assets" in storage_path (old structure: assets/assets/...)
DELETE FROM assets
WHERE storage_path LIKE 'assets/assets/%';

-- 2. Delete assets with incorrect path structure (not assets/category/subcategory/filename)
DELETE FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND storage_path NOT LIKE 'assets/assets/%'  -- Exclude double assets (handled above)
  AND (
    -- Path should have exactly 4 parts: assets/category/subcategory/filename
    array_length(string_to_array(storage_path, '/'), 1) != 4
    -- OR path doesn't start with assets/{category}/
    OR storage_path NOT LIKE CONCAT('assets/', COALESCE(category, ''), '/%')
  );

-- 3. Delete assets where storage_path category doesn't match database category
DELETE FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND category IS NOT NULL
  AND SPLIT_PART(storage_path, '/', 2) != category;

-- 4. Delete assets where storage_path subcategory doesn't match database subcategory
DELETE FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND category IS NOT NULL
  AND subcategory IS NOT NULL
  AND array_length(string_to_array(storage_path, '/'), 1) >= 3
  AND SPLIT_PART(storage_path, '/', 3) != subcategory;

-- 5. Delete assets with old subcategory structure (before character-based folders)
DELETE FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND category IS NOT NULL
  AND subcategory IS NOT NULL
  AND (
    -- Old patterns like: assets/jjk/jujutsu_kaisen/ or assets/jjk/jjk/
    storage_path LIKE CONCAT('assets/', category, '/', category, '/%')
    OR storage_path LIKE CONCAT('assets/', category, '/jujutsu_kaisen/%')
    OR storage_path LIKE CONCAT('assets/', category, '/general/%')
    OR storage_path LIKE CONCAT('assets/', category, '/other/%')
  );

-- Alternative: If you want to delete ALL problematic assets in one go, use this:
-- (Uncomment to use, but make sure you've reviewed the check query results first)

/*
DELETE FROM assets
WHERE 
    -- Double assets in path
    storage_path LIKE 'assets/assets/%'
    -- OR incorrect structure
    OR (
        storage_path IS NOT NULL
        AND storage_path LIKE 'assets/%'
        AND storage_path NOT LIKE 'assets/assets/%'
        AND (
            array_length(string_to_array(storage_path, '/'), 1) != 4
            OR storage_path NOT LIKE CONCAT('assets/', COALESCE(category, ''), '/%')
            OR (category IS NOT NULL AND SPLIT_PART(storage_path, '/', 2) != category)
            OR (category IS NOT NULL AND subcategory IS NOT NULL 
                AND array_length(string_to_array(storage_path, '/'), 1) >= 3
                AND SPLIT_PART(storage_path, '/', 3) != subcategory)
            OR (category IS NOT NULL AND subcategory IS NOT NULL
                AND (
                    storage_path LIKE CONCAT('assets/', category, '/', category, '/%')
                    OR storage_path LIKE CONCAT('assets/', category, '/jujutsu_kaisen/%')
                    OR storage_path LIKE CONCAT('assets/', category, '/general/%')
                    OR storage_path LIKE CONCAT('assets/', category, '/other/%')
                ))
        )
    );
*/

-- After deletion, show summary
SELECT 
    COUNT(*) as remaining_assets,
    COUNT(*) FILTER (WHERE storage_path IS NOT NULL) as assets_with_path,
    COUNT(*) FILTER (WHERE category IS NOT NULL) as assets_with_category,
    COUNT(*) FILTER (
        WHERE storage_path IS NOT NULL
        AND storage_path LIKE 'assets/%'
        AND array_length(string_to_array(storage_path, '/'), 1) = 4
        AND category IS NOT NULL
        AND subcategory IS NOT NULL
        AND storage_path LIKE CONCAT('assets/', category, '/', subcategory, '/%')
    ) as correctly_structured_assets
FROM assets;
