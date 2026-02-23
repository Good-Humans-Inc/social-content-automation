import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface GroupedAssets {
  [category: string]: {
    [subcategory: string]: any[]
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const slug = searchParams.get('slug')
    
    // First, get total count of assets in database
    const { count: totalCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
    
    console.log(`[DEBUG] Total assets in database: ${totalCount}`)
    
    // Fetch ALL assets using pagination (Supabase default limit is 1000)
    // We'll fetch in batches of 1000 and combine them
    const BATCH_SIZE = 1000
    const allAssets: any[] = []
    let hasMore = true
    let offset = 0
    
    // Build base query
    let baseQuery = supabase
      .from('assets')
      .select('*')
      .order('created_at', { ascending: false })
    
    // Filter by slug if provided
    if (slug) {
      baseQuery = baseQuery.eq('slug', slug)
    } else {
      // If no slug specified, only show assets without a slug (null slug)
      baseQuery = baseQuery.is('slug', null)
    }
    
    // Fetch in batches
    console.log(`[DEBUG] Fetching assets in batches of ${BATCH_SIZE}...`)
    while (hasMore) {
      const batchQuery = baseQuery
        .range(offset, offset + BATCH_SIZE - 1)
      
      const { data: batch, error: batchError } = await batchQuery
      
      if (batchError) {
        console.error(`[DEBUG] Error fetching batch at offset ${offset}:`, batchError)
        break
      }
      
      if (batch && batch.length > 0) {
        allAssets.push(...batch)
        console.log(`[DEBUG] Fetched batch: ${batch.length} assets (total so far: ${allAssets.length})`)
        offset += BATCH_SIZE
        
        // If we got less than BATCH_SIZE, we've reached the end
        if (batch.length < BATCH_SIZE) {
          hasMore = false
        }
      } else {
        hasMore = false
      }
      
      // Safety limit to prevent infinite loops
      if (offset >= 50000) {
        console.warn(`[DEBUG] Reached safety limit of 50,000 assets`)
        break
      }
    }
    
    const assets = allAssets
    const error = null // No error if we got here
    console.log(`[DEBUG] Total assets fetched: ${assets.length}`)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Debug: Count assets by status
    const totalAssets = assets?.length || 0
    let assetsWithCategory = 0
    let assetsWithSearchQuery = 0
    let assetsWithBoth = 0
    let assetsWithNeither = 0
    
    for (const asset of assets || []) {
      const hasCategory = !!asset.category
      const hasSearchQuery = asset.search_query && asset.search_query.trim() !== ''
      
      if (hasCategory) assetsWithCategory++
      if (hasSearchQuery) assetsWithSearchQuery++
      if (hasCategory && hasSearchQuery) assetsWithBoth++
      if (!hasCategory && !hasSearchQuery) assetsWithNeither++
    }
    
    console.log('[DEBUG] Asset Statistics:')
    console.log(`[DEBUG]   Total assets fetched: ${totalAssets}`)
    console.log(`[DEBUG]   Assets with category: ${assetsWithCategory}`)
    console.log(`[DEBUG]   Assets with search_query: ${assetsWithSearchQuery}`)
    console.log(`[DEBUG]   Assets with both: ${assetsWithBoth}`)
    console.log(`[DEBUG]   Assets with neither: ${assetsWithNeither}`)

    // Normalize store subcategories
    const normalizeStoreSubcategory = (subcategory: string): string => {
      const normalized = subcategory.toLowerCase().replace(/\s+/g, '_')
      
      // Map variations to standard names
      const storeSubcategoryMap: Record<string, string> = {
        'figure_shop': 'figure_shop',
        'figure_shops': 'figure_shop',
        'figure_collection': 'figure_collection',
        'figure_collections': 'figure_collection',
        'blind_box_store': 'blind_box_store',
        'blind_box_stores': 'blind_box_store',
        'comic_book_store': 'comic_book_store',
        'comic_book_stores': 'comic_book_store',
        'comic_shop': 'comic_book_store',
        'comic_shops': 'comic_book_store',
        'anime_convention': 'anime_convention',
        'anime_conventions': 'anime_convention',
        'comic_convention': 'anime_convention',
        'comic_conventions': 'anime_convention',
        'anime_store': 'anime_store',
        'anime_stores': 'anime_store',
        'manga_shop': 'manga_shop',
        'manga_shops': 'manga_shop'
      }
      
      return storeSubcategoryMap[normalized] || normalized
    }

    // Group assets by category and subcategory
    const grouped: GroupedAssets = {}
    let processedCount = 0
    let skippedCount = 0
    
    for (const asset of assets || []) {
      // Only process assets that either:
      // 1. Have a category set, OR
      // 2. Have a search_query (so they can be categorized)
      // Skip assets with no category AND no search_query (completely empty)
      const hasSearchQuery = asset.search_query && asset.search_query.trim() !== ''
      if (!asset.category && !hasSearchQuery) {
        skippedCount++
        continue // Skip assets that can't be categorized
      }
      
      processedCount++
      
      let category = asset.category
      let subcategory = asset.subcategory
      
      // If no category but has search_query, we'll show it as uncategorized for now
      // (User can click "Categorize Assets" to categorize them)
      if (!category) {
        category = 'uncategorized'
        subcategory = 'other'
      } else {
        category = category || 'uncategorized'
        subcategory = subcategory || 'general'
      }
      
      // Normalize store subcategories
      if (category === 'stores') {
        subcategory = normalizeStoreSubcategory(subcategory)
      }
      
      // Skip 'other' and 'general' subcategories for character-based categories
      const isCharacterCategory = ['lads', 'jjk', 'genshin'].includes(category)
      if (isCharacterCategory && (subcategory === 'other' || subcategory === 'general')) {
        continue
      }
      
      if (!grouped[category]) {
        grouped[category] = {}
      }
      
      if (!grouped[category][subcategory]) {
        grouped[category][subcategory] = []
      }
      
      grouped[category][subcategory].push(asset)
    }

    return NextResponse.json({ 
      grouped,
      debug: {
        totalAssetsInDatabase: totalCount || 0,
        totalAssetsFetched: totalAssets,
        assetsWithCategory,
        assetsWithSearchQuery,
        assetsWithBoth,
        assetsWithNeither,
        processedCount,
        skippedCount,
        categoriesFound: Object.keys(grouped).length,
        totalGroupedAssets: Object.values(grouped).reduce((sum, cats) => 
          sum + Object.values(cats).reduce((catSum, assets) => catSum + assets.length, 0), 0
        )
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
