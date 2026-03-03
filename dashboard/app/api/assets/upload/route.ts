import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createHash } from 'crypto'
import { uploadToGcs, isGcsConfigured, getGcsBucketImages } from '@/lib/gcs'

// Search query mapping (matches Python implementation)
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
      // Try to extract character (expanded list to match extension)
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
      // Default to 'general' instead of 'lads' to avoid nested folder structure
      return { category: 'lads', subcategory: 'general', character: null }
    }
  
  // Handle JJK - extract character and use as subcategory
  if (lowerTerm.includes('jjk') || lowerTerm.includes('jujutsu')) {
    // JJK character list with aliases
    const jjkCharacters = [
      'gojo satoru', 'sukuna', 'megumi fushiguro', 'yuji itadori', 'nobara kugisaki',
      'nanami', 'todo', 'yuta okkotsu', 'toji fushiguro', 'geto suguru', 'panda', 'toge inumaki',
      'maki zenin', 'kasumi miwa', 'yuki tsukumo', 'kenjaku', 'mahito', 'jogo', 'hanami', 'dagon'
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
      'kasumi miwa': ['miwa', 'kasumi miwa', 'kasumi'],
      'yuki tsukumo': ['yuki', 'tsukumo', 'yuki tsukumo'],
      'kenjaku': ['kenjaku'],
      'mahito': ['mahito'],
      'jogo': ['jogo'],
      'hanami': ['hanami'],
      'dagon': ['dagon']
    }
    
    // Check aliases first (more specific) - sort by length descending to match most specific first
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
        // Use character name as subcategory (sanitized)
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
    
    // No character found, use default subcategory
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
    // Use admin client to bypass RLS for asset uploads
    // This allows the extension to upload assets without authentication
    const supabase = createAdminClient()
    const formData = await request.formData()
    const file = formData.get('file') as File
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : []
    const metadata = formData.get('metadata') ? JSON.parse(formData.get('metadata') as string) : {}
    const slug = formData.get('slug') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Reject unsupported image types so we don't store files that can't be displayed
    const SUPPORTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    const fileType = (file.type || '').toLowerCase().split(';')[0].trim()
    if (!fileType || !SUPPORTED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.', unsupported: true },
        { status: 400 }
      )
    }
    if (file.size < 500) {
      return NextResponse.json(
        { error: 'File too small to be a valid image.', unsupported: true },
        { status: 400 }
      )
    }

    // Check for duplicate by image URL (normalized) BEFORE uploading file
    // Pinterest images can appear on multiple pins, so we check the actual image URL, not the pin URL
    const originalImageUrl = metadata?.original_image_url || metadata?.image_url || null
    
    // Normalize Pinterest image URLs by removing size parameters and query strings
    // Example: https://i.pinimg.com/736x/abc/def/123.jpg?param=value -> https://i.pinimg.com/abc/def/123.jpg
    const normalizeImageUrl = (url: string | null): string | null => {
      if (!url) return null
      try {
        // Remove query parameters
        let normalized = url.split('?')[0].split('#')[0]
        // Remove size parameters from Pinterest URLs (e.g., /736x/, /564x/, etc.)
        normalized = normalized.replace(/\/\d+x\d*\//g, '/')
        // Remove trailing size parameters
        normalized = normalized.replace(/\/\d+x\d*$/g, '')
        return normalized
      } catch (e) {
        return url
      }
    }
    
    const normalizedImageUrl = normalizeImageUrl(originalImageUrl)
    
    // Check by normalized image URL first (most reliable for detecting actual duplicate images)
    if (normalizedImageUrl && originalImageUrl) {
      // Extract unique identifier from Pinterest image URL
      // Pinterest URLs are like: https://i.pinimg.com/736x/ab/cd/ef/filename.jpg
      // We extract the path part after the domain for matching
      const urlMatch = originalImageUrl.match(/i\.pinimg\.com\/(.+)/)
      const imagePath = urlMatch ? urlMatch[1].split('?')[0].split('/').slice(1).join('/') : null
      
      if (imagePath) {
        // Query for assets where metadata contains this image path
        // We'll check a reasonable number of recent assets
        const { data: recentAssets, error: checkImageError } = await supabase
          .from('assets')
          .select('id, url, storage_path, created_at, metadata')
          .order('created_at', { ascending: false })
          .limit(500) // Check last 500 assets (adjust based on your needs)

        if (checkImageError && checkImageError.code !== 'PGRST116') {
          console.error('Error checking for duplicate by image URL:', checkImageError)
        }

        // Check if any existing asset has the same normalized image URL
        if (recentAssets && recentAssets.length > 0) {
          for (const asset of recentAssets) {
            const existingOriginalUrl = asset.metadata?.original_image_url || asset.metadata?.image_url
            if (existingOriginalUrl) {
              // Check if the image path matches
              const existingMatch = existingOriginalUrl.match(/i\.pinimg\.com\/(.+)/)
              const existingPath = existingMatch ? existingMatch[1].split('?')[0].split('/').slice(1).join('/') : null
              
              if (existingPath === imagePath) {
                // Duplicate found by image URL - return existing asset without uploading
                console.log(`[DUPLICATE] Found duplicate image: ${normalizedImageUrl}`)
                return NextResponse.json({ 
                  data: asset, 
                  message: 'Asset with this image URL already exists',
                  duplicate: true
                }, { status: 200 })
              }
            }
          }
        }
      }
    }
    
    // Also check by source_url (Pinterest pin URL) as secondary check
    const sourceUrl = metadata?.source_url
    if (sourceUrl) {
      const { data: existingBySource, error: checkSourceError } = await supabase
        .from('assets')
        .select('id, url, storage_path, created_at')
        .eq("metadata->>'source_url'", sourceUrl)
        .maybeSingle()

      if (checkSourceError && checkSourceError.code !== 'PGRST116') {
        console.error('Error checking for duplicate by source URL:', checkSourceError)
      }

      if (existingBySource) {
        // Duplicate found by source URL - return existing asset without uploading
        return NextResponse.json({ 
          data: existingBySource, 
          message: 'Asset with this source URL already exists',
          duplicate: true
        }, { status: 200 })
      }
    }

    // Upload to Supabase Storage with meaningful filename
    const fileExt = file.name.split('.').pop()
    
    // Extract fandom and character from metadata for better naming
    // Priority: formData fandom > metadata fandom > extract from search_query > 'unknown'
    const fandomValue = formData.get('fandom') as string | null
    let fandom = fandomValue || metadata?.fandom || 'unknown'
    let character = metadata?.character || metadata?.character_name || 'unknown'
    
    // Extract category and subcategory from search query
    // Always try to categorize from search_query/description, even if category exists in metadata
    // This ensures proper categorization during scraping
    const searchQuery = metadata?.search_query || metadata?.search_terms?.[0] || null
    const description = metadata?.description || null
    
    // Try to extract category from search query or description
    let category = metadata?.category || null
    let subcategory = metadata?.subcategory || null
    
    // Always try to categorize from search query/description (overrides metadata if better match found)
    const categoryInfo = findCategoryFromSearchTerm(searchQuery, description)
    
    // Use detected category if:
    // 1. No category in metadata, OR
    // 2. Category in metadata is 'uncategorized', OR  
    // 3. We found a better match (not uncategorized)
    if (categoryInfo.category && 
        (categoryInfo.category !== 'uncategorized') &&
        (!category || category === 'uncategorized' || categoryInfo.category !== category)) {
      category = categoryInfo.category
      subcategory = categoryInfo.subcategory || 'other'
      // Also update character if found
      if (categoryInfo.character && (!character || character === 'unknown')) {
        character = categoryInfo.character
      }
    } else if (!category && searchQuery) {
      // Fallback: if no category at all, use what we found (even if uncategorized)
      category = categoryInfo.category || 'uncategorized'
      subcategory = categoryInfo.subcategory || 'other'
      if (categoryInfo.character && (!character || character === 'unknown')) {
        character = categoryInfo.character
      }
    }
    
    // Special handling for JJK: always use character as subcategory if available
    if (category === 'jjk' || fandom === 'jjk' || (searchQuery && (searchQuery.toLowerCase().includes('jjk') || searchQuery.toLowerCase().includes('jujutsu')))) {
      category = 'jjk' // Ensure category is set to jjk
      
      // If we have a character, use it as subcategory
      if (character && character !== 'unknown' && character !== null) {
        const sanitizedChar = character.replace(/\s+/g, '_').toLowerCase()
        subcategory = sanitizedChar
      } else if (searchQuery) {
        // Try to extract character from search query if not in metadata
        const categoryInfo = findCategoryFromSearchTerm(searchQuery, metadata?.description)
        if (categoryInfo.character) {
          character = categoryInfo.character
          const sanitizedChar = character.replace(/\s+/g, '_').toLowerCase()
          subcategory = sanitizedChar
        } else {
          // No character found, use default
          subcategory = 'other'
        }
      } else {
        // No character and no search query, use default
        subcategory = subcategory || 'other'
      }
    }
    
    // If still unknown, try to extract from search_query
    if ((fandom === 'unknown' || character === 'unknown') && searchQuery) {
      // Simple extraction logic (can be improved)
      const lowerQuery = searchQuery.toLowerCase()
      
      // Check for "love and deep space" or "lads"
      if (lowerQuery.includes('love') && lowerQuery.includes('deep') && lowerQuery.includes('space')) {
        fandom = fandom === 'unknown' ? 'lads' : fandom
      } else if (lowerQuery.includes('lads')) {
        fandom = fandom === 'unknown' ? 'lads' : fandom
      }
      
      // Check for character names (including JJK characters)
      if (character === 'unknown') {
        const characterNames = [
          // LADS Main characters
          'xavier', 'zayne', 'rafayel', 'caleb', 'sylus',
          // LADS Supporting characters
          'aislinn', 'andrew', 'benedict', 'carter', 'dimitri', 'noah', 'gideon', 'greyson',
          'jenna', 'jeremiah', 'josephine', 'kevi', 'leon', 'luke', 'kieran', 'lumiere',
          'mephisto', 'nero', 'otto', 'philip', 'player', 'lucius', 'raymond', 'riley',
          'simone', 'soren', 'talia', 'tara', 'thomas', 'ulysses', 'viper', 'yvonne',
          // Chainsaw Man characters
          'pochita', 'denji', 'power', 'aki', 'makima', 'reze', 'kobeni',
          // JJK characters (check aliases too)
          'gojo', 'satoru', 'sukuna', 'megumi', 'fushiguro', 'yuji', 'itadori', 'nobara', 'kugisaki',
          'nanami', 'todo', 'yuta', 'okkotsu', 'toji', 'geto', 'suguru', 'panda', 'toge', 'inumaki',
          'maki', 'zenin', 'miwa', 'kasumi', 'yuki', 'tsukumo', 'kenjaku', 'mahito', 'jogo', 'hanami', 'dagon'
        ]
        for (const charName of characterNames) {
          if (lowerQuery.includes(charName)) {
            character = charName
            break
          }
        }
      }
    }
    
    // Process image to extract metadata (dimensions, hash, aspect ratio)
    // Convert File to Buffer for processing
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    let width: number | null = null
    let height: number | null = null
    let aspectRatio: number | null = null
    let fileHash: string | null = null
    
    try {
      // Get image dimensions using sharp
      const imageMetadata = await sharp(buffer).metadata()
      width = imageMetadata.width || null
      height = imageMetadata.height || null
      
      if (width && height) {
        aspectRatio = Math.round((width / height) * 10000) / 10000 // Round to 4 decimal places
      }
      
      // Calculate MD5 hash of the file
      fileHash = createHash('md5').update(buffer).digest('hex')
    } catch (error) {
      // If image processing fails, reject so we don't store corrupt/unsupported images
      console.warn('Error processing image (unsupported or corrupt):', error)
      return NextResponse.json(
        { error: 'Image could not be processed (unsupported or corrupt).', unsupported: true },
        { status: 400 }
      )
    }
    
    // Check for duplicate by file hash (more reliable than URL)
    if (fileHash) {
      const { data: existingByHash, error: checkHashError } = await supabase
        .from('assets')
        .select('id, url, storage_path, created_at')
        .eq('file_hash', fileHash)
        .maybeSingle()
      
      if (checkHashError && checkHashError.code !== 'PGRST116') {
        console.error('Error checking for duplicate by file hash:', checkHashError)
      }
      
      if (existingByHash) {
        // Duplicate found by file hash - return existing asset without uploading
        console.log(`[DUPLICATE] Found duplicate image by hash: ${fileHash.substring(0, 8)}...`)
        return NextResponse.json({ 
          data: existingByHash, 
          message: 'Asset with this file hash already exists',
          duplicate: true
        }, { status: 200 })
      }
    }

    const sanitize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30)
    const sanitizedFandom = sanitize(fandom)
    const sanitizedCharacter = sanitize(character)
    const sanitizedCategory = sanitize(category || 'uncategorized')
    const sanitizedSubcategory = sanitize(subcategory || 'other')
    const timestamp = Date.now()
    
    // Create meaningful filename: fandom_character_timestamp.ext
    const fileName = `${sanitizedFandom}_${sanitizedCharacter}_${timestamp}.${fileExt}`
    // Organize by category/subcategory: assets/{category}/{subcategory}/filename.ext
    const filePath = `assets/${sanitizedCategory}/${sanitizedSubcategory}/${fileName}`

    let publicUrl: string

    if (isGcsConfigured() && getGcsBucketImages()) {
      // Upload to GCS (babymilu-images)
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const contentType = file.type || `image/${fileExt}`
      try {
        publicUrl = await uploadToGcs(getGcsBucketImages(), filePath, buffer, contentType)
      } catch (gcsErr) {
        console.error('GCS upload failed, falling back to Supabase:', gcsErr)
        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(filePath, buffer, { cacheControl: '3600', upsert: false, contentType })
        if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })
        const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filePath)
        publicUrl = urlData.publicUrl
      }
    } else {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 })
      }
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filePath)
      publicUrl = urlData.publicUrl
    }

    // Update metadata with processed image information
    const enrichedMetadata = {
      ...metadata,
      width,
      height,
      aspect_ratio: aspectRatio,
      file_hash: fileHash,
    }

    // Save metadata to database
    // Note: searchQuery is already extracted above on line 28
    // Normalize slug: convert to lowercase and replace spaces with hyphens
    const normalizedSlug = slug && slug.trim() ? slug.trim().toLowerCase().replace(/\s+/g, '-') : null
    
    const { data: assetData, error: dbError } = await supabase
      .from('assets')
      .insert({
        url: publicUrl,
        storage_path: filePath,
        fandom,
        tags,
        metadata: enrichedMetadata,
        search_query: searchQuery,
        category: category || 'uncategorized',
        subcategory: subcategory || 'other',
        slug: normalizedSlug,
        // Add processed image metadata to direct columns
        width,
        height,
        aspect_ratio: aspectRatio,
        file_hash: fileHash,
      })
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ data: assetData }, { status: 201 })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
