-- Check for assets with invalid storage paths that don't match current structure
-- Current structure: assets/{category}/{character}/filename.jpg
-- Old structure: assets/assets/{category}/{old_subcategory}/filename.jpg or other variations

-- 1. Assets with double "assets" in storage_path (old structure)
SELECT 
    id,
    url,
    storage_path,
    category,
    subcategory,
    created_at,
    'Double assets in path (old structure)' as issue_type
FROM assets
WHERE storage_path LIKE 'assets/assets/%'
ORDER BY created_at DESC;

-- 2. Assets where storage_path doesn't follow the correct pattern: assets/{category}/{subcategory}/filename
-- Should have exactly 4 parts: assets, category, subcategory, filename
SELECT 
    id,
    url,
    storage_path,
    category,
    subcategory,
    created_at,
    'Incorrect path structure (not assets/category/subcategory/filename)' as issue_type
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND storage_path NOT LIKE 'assets/assets/%'  -- Exclude double assets (handled above)
  AND (
    -- Path should have exactly 4 parts: assets/category/subcategory/filename
    array_length(string_to_array(storage_path, '/'), 1) != 4
    -- OR path doesn't start with assets/{category}/
    OR storage_path NOT LIKE CONCAT('assets/', COALESCE(category, ''), '/%')
  )
ORDER BY created_at DESC;

-- 3. Assets where storage_path category doesn't match database category
SELECT 
    id,
    url,
    storage_path,
    category,
    subcategory,
    SPLIT_PART(storage_path, '/', 2) as path_category,
    created_at,
    'Path category mismatch' as issue_type
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND category IS NOT NULL
  AND SPLIT_PART(storage_path, '/', 2) != category
ORDER BY created_at DESC;

-- 4. Assets where storage_path subcategory doesn't match database subcategory
SELECT 
    id,
    url,
    storage_path,
    category,
    subcategory,
    SPLIT_PART(storage_path, '/', 3) as path_subcategory,
    created_at,
    'Path subcategory mismatch' as issue_type
FROM assets
WHERE storage_path IS NOT NULL
  AND storage_path LIKE 'assets/%'
  AND category IS NOT NULL
  AND subcategory IS NOT NULL
  AND array_length(string_to_array(storage_path, '/'), 1) >= 3
  AND SPLIT_PART(storage_path, '/', 3) != subcategory
ORDER BY created_at DESC;

-- 5. Assets with old subcategory names that don't match character folders
-- These are assets that might have been organized before the character-based structure
SELECT 
    id,
    url,
    storage_path,
    category,
    subcategory,
    created_at,
    'Old subcategory structure (e.g., jujutsu_kaisen instead of character name)' as issue_type
FROM assets
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
  )
ORDER BY created_at DESC;

-- 6. Summary count of all problematic assets
SELECT 
    COUNT(*) FILTER (WHERE storage_path LIKE 'assets/assets/%') as double_assets_in_path,
    COUNT(*) FILTER (
        WHERE storage_path IS NOT NULL
        AND storage_path LIKE 'assets/%'
        AND storage_path NOT LIKE 'assets/assets/%'
        AND (
            array_length(string_to_array(storage_path, '/'), 1) != 4
            OR storage_path NOT LIKE CONCAT('assets/', COALESCE(category, ''), '/%')
        )
    ) as incorrect_structure,
    COUNT(*) FILTER (
        WHERE storage_path IS NOT NULL
        AND storage_path LIKE 'assets/%'
        AND category IS NOT NULL
        AND SPLIT_PART(storage_path, '/', 2) != category
    ) as category_mismatch,
    COUNT(*) FILTER (
        WHERE storage_path IS NOT NULL
        AND storage_path LIKE 'assets/%'
        AND category IS NOT NULL
        AND subcategory IS NOT NULL
        AND array_length(string_to_array(storage_path, '/'), 1) >= 3
        AND SPLIT_PART(storage_path, '/', 3) != subcategory
    ) as subcategory_mismatch,
    COUNT(*) FILTER (
        WHERE storage_path IS NOT NULL
        AND storage_path LIKE 'assets/%'
        AND category IS NOT NULL
        AND subcategory IS NOT NULL
        AND (
            storage_path LIKE CONCAT('assets/', category, '/', category, '/%')
            OR storage_path LIKE CONCAT('assets/', category, '/jujutsu_kaisen/%')
            OR storage_path LIKE CONCAT('assets/', category, '/general/%')
            OR storage_path LIKE CONCAT('assets/', category, '/other/%')
        )
    ) as old_structure,
    COUNT(*) as total_assets,
    COUNT(*) FILTER (
        WHERE storage_path LIKE 'assets/assets/%'
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
        )
    ) as total_problematic_assets
FROM assets;
