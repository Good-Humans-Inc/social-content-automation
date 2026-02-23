import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Same category detection logic as upload route
const SEARCH_QUERY_MAP: Record<string, { category: string; subcategories: string[] }> = {
  'lads': {
    category: 'lads',
    subcategories: ['love and deepspace', 'lads xavier', 'lads zayne', 'lads rafayel', 'chainsaw man', 'csm']
  },
  'jjk': {
    category: 'jjk',
    subcategories: ['jujutsu kaisen', 'gojo satoru', 'sukuna jjk', 'megumi fushiguro']
  },
  'genshin': {
    category: 'genshin',
    subcategories: ['genshin impact', 'zhongli genshin', 'raiden shogun']
  },
  'generic_anime': {
    category: 'generic_anime',
    subcategories: ['anime aesthetic', 'manga collection', 'anime room']
  },
  'stores': {
    category: 'stores',
    subcategories: ['anime store', 'anime convention', 'manga shop', 'figure collection', 'figure shop', 'comic convention', 'comic shop', 'comic book store', 'blind box store', 'blind box stores']
  }
}

function findCategoryFromSearchTerm(searchTerm: string | null, description?: string | null): { category: string | null; subcategory: string | null; character: string | null } {
  if (!searchTerm && !description) {
    return { category: null, subcategory: null, character: null }
  }
  
  const lowerTerm = (searchTerm || description || '').toLowerCase()
  
  // Check for "love and deepspace" first
  const isLoveAndDeepspace = (lowerTerm.includes('love') && lowerTerm.includes('deep') && lowerTerm.includes('space')) || 
                             (lowerTerm.includes('love') && lowerTerm.includes('deepspace'))
  
  // Handle LADS with character
  if (isLoveAndDeepspace || lowerTerm.includes('lads')) {
    const ladsCharacters = [
      'xavier', 'zayne', 'rafayel', 'caleb', 'sylus',
      'aislinn', 'andrew', 'benedict', 'carter', 'dimitri', 'noah', 'gideon', 'greyson',
      'jenna', 'jeremiah', 'josephine', 'kevi', 'leon', 'luke', 'kieran', 'lumiere',
      'mephisto', 'nero', 'otto', 'philip', 'player', 'lucius', 'raymond', 'riley',
      'simone', 'soren', 'talia', 'tara', 'thomas', 'ulysses', 'viper', 'yvonne'
    ]
    for (const char of ladsCharacters) {
      if (lowerTerm.includes(char)) {
        return {
          category: 'lads',
          subcategory: char,
          character: char
        }
      }
    }
    
    if (lowerTerm.includes('chainsaw') || lowerTerm.includes('csm')) {
      return { category: 'lads', subcategory: 'chainsaw_man', character: null }
    }
    return { category: 'lads', subcategory: 'general', character: null }
  }
  
  // Handle JJK - extract character and use as subcategory
  if (lowerTerm.includes('jjk') || lowerTerm.includes('jujutsu')) {
    const jjkCharacters = [
      'gojo satoru', 'sukuna', 'megumi fushiguro', 'yuji itadori', 'nobara kugisaki',
      'nanami', 'todo', 'yuta okkotsu', 'toji fushiguro', 'geto suguru', 'panda', 'toge inumaki',
      'maki zenin', 'yuki tsukumo', 'kenjaku', 'mahito', 'jogo', 'hanami', 'dagon'
    ]
    
    const jjkAliases: Record<string, string[]> = {
      'gojo satoru': ['gojo', 'satoru gojo', 'satoru', 'gojo satoru'],
      'sukuna': ['sukuna', 'ryomen sukuna'],
      'megumi fushiguro': ['megumi', 'fushiguro', 'megumi fushiguro'],
      'yuji itadori': ['yuji', 'itadori', 'yuji itadori'],
      'nobara kugisaki': ['nobara', 'kugisaki', 'nobara kugisaki'],
      'nanami': ['nanami', 'kento nanami'],
      'todo': ['todo', 'aoi todo'],
      'yuta okkotsu': ['yuta', 'okkotsu', 'yuta okkotsu'],
      'toji fushiguro': ['toji', 'toji fushiguro'],
      'geto suguru': ['geto', 'suguru geto', 'suguru'],
      'panda': ['panda'],
      'toge inumaki': ['toge', 'inumaki', 'toge inumaki'],
      'maki zenin': ['maki', 'zenin', 'maki zenin'],
      'yuki tsukumo': ['yuki', 'tsukumo', 'yuki tsukumo'],
      'kenjaku': ['kenjaku'],
      'mahito': ['mahito'],
      'jogo': ['jogo'],
      'hanami': ['hanami'],
      'dagon': ['dagon']
    }
    
    // Check aliases first - sort by length descending to match most specific first
    // Collect all (charName, alias) pairs and sort by alias length
    const allAliases: Array<[string, string]> = []
    for (const [charName, aliases] of Object.entries(jjkAliases)) {
      for (const alias of aliases) {
        allAliases.push([charName, alias])
      }
    }
    // Sort by alias length (longest first) to match most specific aliases first
    allAliases.sort((a, b) => b[1].length - a[1].length)
    
    for (const [charName, alias] of allAliases) {
      if (lowerTerm.includes(alias)) {
        const sanitizedChar = charName.replace(/\s+/g, '_').toLowerCase()
        return {
          category: 'jjk',
          subcategory: sanitizedChar,
          character: charName
        }
      }
    }
    
    // Check direct character names
    for (const charName of jjkCharacters) {
      if (lowerTerm.includes(charName.toLowerCase())) {
        const sanitizedChar = charName.replace(/\s+/g, '_').toLowerCase()
        return {
          category: 'jjk',
          subcategory: sanitizedChar,
          character: charName
        }
      }
    }
    
    return { category: 'jjk', subcategory: 'other', character: null }
  }
  
  // Handle Genshin
  if (lowerTerm.includes('genshin')) {
    return { category: 'genshin', subcategory: 'genshin_impact', character: null }
  }
  
  // Try to match from SEARCH_QUERY_MAP
  // Check subcategories FIRST (more specific) before checking category keys
  // Sort subcategories by length (longest first) to match more specific terms first
  for (const [key, config] of Object.entries(SEARCH_QUERY_MAP)) {
    // Sort subcategories by length descending to match longer/more specific terms first
    const sortedSubcats = [...config.subcategories].sort((a, b) => b.length - a.length)
    
    // Check subcategories first (more specific matches)
    for (const subcat of sortedSubcats) {
      if (lowerTerm.includes(subcat.toLowerCase())) {
        return {
          category: config.category,
          subcategory: subcat.replace(/\s+/g, '_'),
          character: null
        }
      }
    }
    
    // Only check category key if no subcategory matched
    // Make category key check more specific to avoid false matches
    // For "stores", only match if the term is exactly "stores" or starts/ends with it as a word
    if (key === 'stores') {
      // For stores, be more specific - only match if it's a standalone word or exact match
      const storesRegex = /\bstores\b/i
      if (storesRegex.test(lowerTerm) && !lowerTerm.includes('blind box') && !lowerTerm.includes('comic') && !lowerTerm.includes('anime') && !lowerTerm.includes('figure') && !lowerTerm.includes('manga')) {
        return { category: config.category, subcategory: key, character: null }
      }
    } else if (lowerTerm.includes(key)) {
      return { category: config.category, subcategory: key, character: null }
    }
  }
  
  return { category: 'uncategorized', subcategory: 'other', character: null }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { limit, force = false } = body
    
    // Get assets without category or with null category
    // If force=true, also get assets that have search_query but might be miscategorized
    // Also select category and subcategory to see current state
    // IMPORTANT: Make sure search_query column is selected
    let query = supabase
      .from('assets')
      .select('id, metadata, search_query, fandom, category, subcategory')
      .order('created_at', { ascending: false })
    
    // First, let's check what we have in the database
    const testQuery = supabase
      .from('assets')
      .select('id, category, search_query')
      .limit(5)
    
    const { data: testData } = await testQuery
    console.log('[DEBUG] Sample of assets in database:', testData)
    
    // Also check assets WITH search_query values
    const withSearchQueryQuery = supabase
      .from('assets')
      .select('id, category, search_query')
      .not('search_query', 'is', null)
      .neq('search_query', '')
      .limit(5)
    
    const { data: withSearchQueryData } = await withSearchQueryQuery
    console.log('[DEBUG] Sample of assets WITH search_query values:', withSearchQueryData)
    
    // Check uncategorized assets with search_query
    const uncategorizedWithSearchQueryQuery = supabase
      .from('assets')
      .select('id, category, search_query')
      .or('category.is.null,category.eq.uncategorized')
      .not('search_query', 'is', null)
      .neq('search_query', '')
      .limit(5)
    
    const { data: uncategorizedWithSearchQueryData } = await uncategorizedWithSearchQueryQuery
    console.log('[DEBUG] Sample of UNCategorized assets WITH search_query:', uncategorizedWithSearchQueryData)
    
    // Count assets by category status
    const countQuery = supabase
      .from('assets')
      .select('category, search_query', { count: 'exact', head: true })
    
    if (force) {
      // Force mode: Get all assets with search_query, regardless of category
      query = query.not('search_query', 'is', null)
      console.log('[DEBUG] Force mode: Processing all assets with search_query')
    } else {
      // Normal mode: Get uncategorized assets that HAVE search_query
      // Prioritize assets with search_query values - they can actually be categorized!
      query = query
        .or('category.is.null,category.eq.uncategorized')
        .not('search_query', 'is', null)
        .neq('search_query', '') // Also exclude empty strings
      console.log('[DEBUG] Normal mode: Query filter: (category.is.null OR category.eq.uncategorized) AND search_query IS NOT NULL AND search_query != ""')
    }
    
    if (limit) {
      query = query.limit(limit)
    }
    
    const { data: assets, error } = await query
    
    if (error) {
      console.error('[DEBUG] Query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log(`[DEBUG] Query returned ${assets?.length || 0} assets`)
    
    if (!assets || assets.length === 0) {
      // If no assets found, try a different query to see what exists
      const allAssetsQuery = supabase
        .from('assets')
        .select('id, category, search_query')
        .limit(10)
      
      const { data: allAssets } = await allAssetsQuery
      console.log('[DEBUG] Sample of ALL assets (first 10):', allAssets)
      
      return NextResponse.json({ 
        message: 'No uncategorized assets found',
        categorized: 0,
        total: 0,
        debug: {
          sampleAssets: allAssets?.slice(0, 5) || []
        }
      })
    }
    
    // Debug: Log first few assets to see what we got
    console.log('[DEBUG] Sample assets from query:')
    assets.slice(0, 5).forEach((asset: any) => {
      console.log(`[DEBUG]   Asset ${asset.id.substring(0, 8)}:`, {
        hasSearchQuery: !!asset.search_query,
        searchQuery: asset.search_query,
        searchQueryType: typeof asset.search_query,
        hasMetadata: !!asset.metadata,
        category: asset.category,
        subcategory: asset.subcategory
      })
    })
    
    let categorized = 0
    const updates: Array<{ id: string; category: string; subcategory: string }> = []
    const debugInfo: Array<{ id: string; searchQuery: string | null; category: string | null; subcategory: string | null; reason: string }> = []
    
    for (const asset of assets) {
      // Prioritize search_query column first (direct database field)
      // Then fall back to metadata.search_query, then metadata.description
      // Handle empty strings explicitly (not just falsy values)
      const searchQuery = asset.search_query && asset.search_query.trim() !== '' 
        ? asset.search_query 
        : null
      
      let description = null
      let metadata: any = {}
      
      try {
        metadata = typeof asset.metadata === 'string' 
          ? JSON.parse(asset.metadata || '{}') 
          : (asset.metadata || {})
      } catch (e) {
        console.error(`[DEBUG] Error parsing metadata for asset ${asset.id}:`, e)
        metadata = {}
      }
      
      // If no direct search_query, try metadata
      // Handle empty strings - check if it's actually a non-empty string
      const metadataSearchQuery = metadata.search_query && metadata.search_query.trim() !== '' 
        ? metadata.search_query 
        : null
      
      const metadataSearchTerm = metadata.search_terms && metadata.search_terms.length > 0 && metadata.search_terms[0] && metadata.search_terms[0].trim() !== ''
        ? metadata.search_terms[0]
        : null
      
      const finalSearchQuery = searchQuery || metadataSearchQuery || metadataSearchTerm || null
      description = metadata.description || null
      
      // If still no search query, try to extract from source_url (Pinterest URLs sometimes have search terms)
      let extractedSearchQuery = finalSearchQuery
      if (!extractedSearchQuery && metadata.source_url) {
        try {
          const url = new URL(metadata.source_url)
          // Pinterest URLs sometimes have search terms in the path or query params
          const pathParts = url.pathname.split('/').filter(p => p && p !== 'pin' && p.length > 2)
          if (pathParts.length > 0) {
            // Use the last meaningful part of the path as a potential search term
            extractedSearchQuery = pathParts[pathParts.length - 1].replace(/-/g, ' ')
          }
        } catch (e) {
          // Not a valid URL, ignore
        }
      }
      
      // Debug: Log what we found - check raw values
      console.log(`[DEBUG] Asset ${asset.id.substring(0, 8)}...`)
      console.log(`[DEBUG]   - search_query column: ${searchQuery || '(null or empty)'}`)
      console.log(`[DEBUG]   - metadata.search_query: ${metadataSearchQuery || '(null or empty)'}`)
      console.log(`[DEBUG]   - metadata.search_terms: ${JSON.stringify(metadata.search_terms)}`)
      console.log(`[DEBUG]   - metadata.description: ${description || '(none)'}`)
      console.log(`[DEBUG]   - finalSearchQuery: ${searchQueryToUse || '(none)'}`)
      console.log(`[DEBUG]   - extractedSearchQuery: ${extractedSearchQuery || '(none)'}`)
      console.log(`[DEBUG]   - Current category: ${asset.category}, subcategory: ${asset.subcategory}`)
      
      // Use extracted search query if we found one, otherwise use original
      const searchQueryToUse = extractedSearchQuery || finalSearchQuery
      
      // Only categorize if we have a search query or description
      if (!searchQueryToUse && !description) {
        debugInfo.push({
          id: asset.id,
          searchQuery: null,
          category: null,
          subcategory: null,
          reason: 'No search_query or description found'
        })
        console.log(`[DEBUG]   - SKIPPED: No search query or description`)
        continue // Skip assets without search query or description
      }
      
      const catInfo = findCategoryFromSearchTerm(searchQueryToUse, description)
      console.log(`[DEBUG]   - Detected category: ${catInfo.category}, subcategory: ${catInfo.subcategory}`)
      
      // Only update if we found a valid category (not uncategorized)
      if (catInfo.category && catInfo.category !== 'uncategorized') {
        updates.push({
          id: asset.id,
          category: catInfo.category,
          subcategory: catInfo.subcategory || 'other'
        })
        debugInfo.push({
          id: asset.id,
          searchQuery: searchQueryToUse,
          category: catInfo.category,
          subcategory: catInfo.subcategory || 'other',
          reason: 'Will be categorized'
        })
        console.log(`[DEBUG]   - WILL UPDATE: ${catInfo.category}/${catInfo.subcategory}`)
      } else {
        debugInfo.push({
          id: asset.id,
          searchQuery: searchQueryToUse,
          category: catInfo.category,
          subcategory: catInfo.subcategory,
          reason: catInfo.category === 'uncategorized' ? 'Detected as uncategorized' : 'No category detected'
        })
        console.log(`[DEBUG]   - SKIPPED: Category is ${catInfo.category || 'null'}`)
      }
    }
    
    console.log(`[DEBUG] Total assets processed: ${assets.length}`)
    console.log(`[DEBUG] Assets to update: ${updates.length}`)
    console.log(`[DEBUG] Debug info:`, JSON.stringify(debugInfo, null, 2))
    
    // Batch update
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('assets')
        .update({
          category: update.category,
          subcategory: update.subcategory
        })
        .eq('id', update.id)
      
      if (!updateError) {
        categorized++
      }
    }
    
    return NextResponse.json({
      message: `Categorized ${categorized} out of ${assets.length} assets`,
      categorized,
      total: assets.length,
      debug: {
        processed: assets.length,
        toUpdate: updates.length,
        details: debugInfo.slice(0, 20) // Return first 20 for debugging
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
