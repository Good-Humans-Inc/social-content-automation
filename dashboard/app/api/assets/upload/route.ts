import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createHash } from 'crypto'
import { uploadToGcs, isGcsConfigured, getGcsBucketImages, debugGcsConfig } from '@/lib/gcs'

// Static fallback mapping for non-fandom categories
const STATIC_CATEGORY_MAP: Record<string, { category: string; subcategories: string[] }> = {
  'generic_anime': {
    category: 'generic_anime',
    subcategories: ['anime aesthetic', 'manga collection', 'anime room']
  },
  'stores': {
    category: 'stores',
    subcategories: ['anime store', 'anime convention', 'manga shop', 'figure collection', 'figure shop', 'comic convention', 'comic shop', 'comic book store', 'blind box store', 'blind box stores']
  }
}

interface FandomConfig {
  short_id: string
  full_name: string
  aliases: string[]
  characters: { name: string; aliases: string[] }[]
}

let fandomConfigCache: FandomConfig[] | null = null
let fandomCacheTimestamp = 0
const FANDOM_CACHE_TTL = 60_000

async function getFandomConfigs(): Promise<FandomConfig[]> {
  const now = Date.now()
  if (fandomConfigCache && now - fandomCacheTimestamp < FANDOM_CACHE_TTL) {
    return fandomConfigCache
  }

  try {
    const supabase = createAdminClient()
    const { data: fandoms } = await supabase
      .from('fandoms')
      .select('short_id, full_name, aliases')
    const { data: characters } = await supabase
      .from('characters')
      .select('fandom_id, name, aliases, fandoms!inner(short_id)')

    if (fandoms && characters) {
      fandomConfigCache = fandoms.map((f: any) => ({
        short_id: f.short_id,
        full_name: f.full_name,
        aliases: f.aliases || [],
        characters: characters
          .filter((c: any) => c.fandoms?.short_id === f.short_id)
          .map((c: any) => ({ name: c.name, aliases: c.aliases || [] })),
      }))
      fandomCacheTimestamp = now
      return fandomConfigCache!
    }
  } catch {
    // Fall through to empty array (will use static fallback in findCategory)
  }

  return []
}

const FILLER_WORDS = new Set([
  'aesthetic', 'wallpaper', 'anime', 'manga', 'fanart', 'fan', 'art',
  'soft', 'dark', 'cute', 'icon', 'icons', 'pfp', 'profile', 'header',
  'background', 'edit', 'edits', 'game', 'otome', 'cozy', 'vibes',
])

/** Strip fandom aliases and filler words from a search term to extract a character name. */
function extractCharacterFromTerm(
  lowerTerm: string,
  fandom: FandomConfig
): string | null {
  let remaining = lowerTerm
  // Remove all fandom aliases (longest first to avoid partial removal)
  const sortedAliases = [...fandom.aliases].sort((a, b) => b.length - a.length)
  for (const alias of sortedAliases) {
    remaining = remaining.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }
  // Remove filler words
  const words = remaining
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 1 && !FILLER_WORDS.has(w))
  if (words.length === 0 || words.length > 4) return null
  const name = words.join(' ').trim()
  if (name.length < 2) return null
  return name
}

/** Auto-create a character in the characters table if it doesn't already exist. */
async function autoCreateCharacter(fandomShortId: string, characterName: string): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { data: fandom } = await supabase
      .from('fandoms')
      .select('id')
      .eq('short_id', fandomShortId)
      .single()
    if (!fandom) return

    const normalized = characterName.toLowerCase().trim()
    const aliases = [normalized]
    const nameParts = normalized.split(/\s+/)
    if (nameParts.length > 1) {
      for (const part of nameParts) {
        if (part.length > 2) aliases.push(part)
      }
      aliases.push(nameParts.reverse().join(' '))
    }

    await supabase
      .from('characters')
      .insert({
        fandom_id: fandom.id,
        name: normalized,
        aliases: [...new Set(aliases)],
      })
      .select()
      .single()
  } catch {
    // Ignore duplicates or any other errors — non-critical
  }
}

async function findCategoryFromSearchTerm(searchTerm: string | null, description?: string | null): Promise<{ category: string | null; subcategory: string | null; character: string | null }> {
  if (!searchTerm && !description) {
    return { category: null, subcategory: null, character: null }
  }

  const lowerTerm = (searchTerm || description || '').toLowerCase()
  const fandomConfigs = await getFandomConfigs()

  // Try dynamic fandom configs first
  for (const fandom of fandomConfigs) {
    const fandomMatched = fandom.aliases.some((alias) => lowerTerm.includes(alias.toLowerCase()))
    if (!fandomMatched) continue

    // Fandom matched - try to find a character in the DB
    const allAliases: Array<[string, string]> = []
    for (const char of fandom.characters) {
      for (const alias of char.aliases) {
        allAliases.push([char.name, alias])
      }
      allAliases.push([char.name, char.name])
    }
    allAliases.sort((a, b) => b[1].length - a[1].length)

    for (const [charName, alias] of allAliases) {
      if (lowerTerm.includes(alias.toLowerCase())) {
        const sanitizedChar = charName.replace(/\s+/g, '_').toLowerCase()
        return {
          category: fandom.short_id,
          subcategory: sanitizedChar,
          character: charName,
        }
      }
    }

    // Fandom matched but no known character — extract character name from search term
    // by stripping fandom aliases and common filler words
    const extracted = extractCharacterFromTerm(lowerTerm, fandom)
    if (extracted) {
      await autoCreateCharacter(fandom.short_id, extracted)
      fandomConfigCache = null // bust cache so next upload picks it up
      return {
        category: fandom.short_id,
        subcategory: extracted.replace(/\s+/g, '_').toLowerCase(),
        character: extracted,
      }
    }

    return { category: fandom.short_id, subcategory: 'general', character: null }
  }

  // Try static non-fandom categories (stores, generic_anime, etc.)
  for (const [key, config] of Object.entries(STATIC_CATEGORY_MAP)) {
    const sortedSubcats = [...config.subcategories].sort((a, b) => b.length - a.length)

    for (const subcat of sortedSubcats) {
      if (lowerTerm.includes(subcat.toLowerCase())) {
        return {
          category: config.category,
          subcategory: subcat.replace(/\s+/g, '_'),
          character: null,
        }
      }
    }

    if (key === 'stores') {
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
    const categoryInfo = await findCategoryFromSearchTerm(searchQuery, description)

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
    
    // For any DB-backed fandom: use character as subcategory when available
    const fandomConfigs = await getFandomConfigs()
    const matchedFandom = fandomConfigs.find((fc) =>
      category === fc.short_id || fandom === fc.short_id ||
      (searchQuery && fc.aliases.some((a) => searchQuery.toLowerCase().includes(a.toLowerCase())))
    )
    if (matchedFandom) {
      category = matchedFandom.short_id

      if (character && character !== 'unknown' && character !== null) {
        subcategory = character.replace(/\s+/g, '_').toLowerCase()
      } else if (searchQuery) {
        const categoryInfo = await findCategoryFromSearchTerm(searchQuery, metadata?.description)
        if (categoryInfo.character) {
          character = categoryInfo.character
          subcategory = character.replace(/\s+/g, '_').toLowerCase()
        } else {
          subcategory = subcategory || 'general'
        }
      } else {
        subcategory = subcategory || 'general'
      }
    }
    
    // If still unknown, try to extract from search_query using dynamic config
    if ((fandom === 'unknown' || character === 'unknown') && searchQuery) {
      const lowerQuery = searchQuery.toLowerCase()
      const fandomConfigs = await getFandomConfigs()

      for (const fc of fandomConfigs) {
        const fandomMatched = fc.aliases.some((alias) => lowerQuery.includes(alias.toLowerCase()))
        if (fandomMatched && fandom === 'unknown') {
          fandom = fc.short_id
        }

        if (character === 'unknown' && fandomMatched) {
          for (const ch of fc.characters) {
            const charMatched = ch.aliases.some((a) => lowerQuery.includes(a.toLowerCase())) ||
              lowerQuery.includes(ch.name.toLowerCase())
            if (charMatched) {
              character = ch.name
              if (fandom === 'unknown') fandom = fc.short_id
              break
            }
          }
        }
        if (character !== 'unknown') break
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

    const gcsDebug = debugGcsConfig()
    console.log(`[UPLOAD] GCS debug:`, JSON.stringify(gcsDebug))
    console.log(`[UPLOAD] Upload target — path: ${filePath}, category: ${category}, subcategory: ${subcategory}, character: ${character}, fandom: ${fandom}`)

    if (!gcsDebug.isConfigured) {
      console.error('[UPLOAD] GCS is NOT configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON in your .env')
      return NextResponse.json({
        error: 'GCS is not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON.',
        gcs_debug: gcsDebug,
      }, { status: 500 })
    }

    if (!gcsDebug.keyFileExists && !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      console.error(`[UPLOAD] GCS key file does NOT exist at: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`)
      return NextResponse.json({
        error: `GCS key file not found at: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`,
        gcs_debug: gcsDebug,
      }, { status: 500 })
    }

    const contentType = file.type || `image/${fileExt}`
    try {
      publicUrl = await uploadToGcs(getGcsBucketImages(), filePath, buffer, contentType)
    } catch (gcsErr: any) {
      const errMsg = gcsErr?.message || String(gcsErr)
      const errStack = gcsErr?.stack || ''
      console.error('[UPLOAD] GCS upload FAILED (no fallback):', errMsg)
      console.error('[UPLOAD] GCS error stack:', errStack)
      return NextResponse.json({
        error: `GCS upload failed: ${errMsg}`,
        gcs_debug: gcsDebug,
        path: filePath,
      }, { status: 500 })
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

    // Link asset to template if template_id is provided
    const templateId = metadata?.template_id
    if (templateId && assetData?.id) {
      try {
        await supabase
          .from('asset_templates')
          .upsert(
            { asset_id: assetData.id, template_id: templateId },
            { onConflict: 'asset_id,template_id' }
          )
      } catch (linkError) {
        console.warn('Failed to link asset to template (non-fatal):', linkError)
      }
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
