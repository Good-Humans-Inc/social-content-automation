import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createHash } from 'crypto'

// Reuse the category extraction logic from upload route
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
  
  return { category: 'uncategorized', subcategory: 'other', character: null }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { limit, asset_id } = body
    
    // Get unprocessed assets (those without file_hash)
    let query = supabase
      .from('assets')
      .select('*')
      .is('file_hash', null)
      .order('created_at', { ascending: false })
    
    if (asset_id) {
      query = query.eq('id', asset_id)
    } else if (limit) {
      query = query.limit(limit)
    } else {
      query = query.limit(100) // Default to 100 at a time
    }
    
    const { data: assets, error: fetchError } = await query
    
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }
    
    if (!assets || assets.length === 0) {
      return NextResponse.json({ 
        message: 'No unprocessed assets found',
        processed: 0,
        failed: 0
      }, { status: 200 })
    }
    
    let processed = 0
    let failed = 0
    const errors: string[] = []
    
    for (const asset of assets) {
      try {
        // Skip if no URL
        if (!asset.url) {
          failed++
          errors.push(`Asset ${asset.id.substring(0, 8)}: No URL`)
          continue
        }
        
        // Download image from storage URL
        const response = await fetch(asset.url)
        if (!response.ok) {
          failed++
          errors.push(`Asset ${asset.id.substring(0, 8)}: Failed to download (${response.status})`)
          continue
        }
        
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        
        // Process image metadata
        let width: number | null = null
        let height: number | null = null
        let aspectRatio: number | null = null
        let fileHash: string | null = null
        
        try {
          const imageMetadata = await sharp(buffer).metadata()
          width = imageMetadata.width || null
          height = imageMetadata.height || null
          
          if (width && height) {
            aspectRatio = Math.round((width / height) * 10000) / 10000
          }
          
          fileHash = createHash('md5').update(buffer).digest('hex')
        } catch (error) {
          // If image processing fails, still calculate hash
          try {
            fileHash = createHash('md5').update(buffer).digest('hex')
          } catch (hashError) {
            failed++
            errors.push(`Asset ${asset.id.substring(0, 8)}: Failed to process image`)
            continue
          }
        }
        
        // Extract category from search query/description
        const metadata = typeof asset.metadata === 'string' 
          ? JSON.parse(asset.metadata || '{}') 
          : (asset.metadata || {})
        
        const searchQuery = asset.search_query || metadata?.search_query || metadata?.search_terms?.[0] || null
        const description = metadata?.description || null
        
        let category = asset.category || metadata?.category || null
        let subcategory = asset.subcategory || metadata?.subcategory || null
        
        // Try to categorize from search query/description
        const categoryInfo = findCategoryFromSearchTerm(searchQuery, description)
        
        if (categoryInfo.category && 
            (categoryInfo.category !== 'uncategorized') &&
            (!category || category === 'uncategorized' || categoryInfo.category !== category)) {
          category = categoryInfo.category
          subcategory = categoryInfo.subcategory || 'other'
        } else if (!category && searchQuery) {
          category = categoryInfo.category || 'uncategorized'
          subcategory = categoryInfo.subcategory || 'other'
        }
        
        // Update metadata
        const enrichedMetadata = {
          ...metadata,
          width,
          height,
          aspect_ratio: aspectRatio,
          file_hash: fileHash,
        }
        
        // Update database
        const { error: updateError } = await supabase
          .from('assets')
          .update({
            file_hash: fileHash,
            width,
            height,
            aspect_ratio: aspectRatio,
            category: category || 'uncategorized',
            subcategory: subcategory || 'other',
            metadata: enrichedMetadata,
          })
          .eq('id', asset.id)
        
        if (updateError) {
          failed++
          errors.push(`Asset ${asset.id.substring(0, 8)}: ${updateError.message}`)
        } else {
          processed++
        }
      } catch (error) {
        failed++
        errors.push(`Asset ${asset.id.substring(0, 8)}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    return NextResponse.json({
      message: `Processed ${processed} assets, ${failed} failed`,
      processed,
      failed,
      total: assets.length,
      errors: errors.slice(0, 10) // Limit errors in response
    }, { status: 200 })
  } catch (error) {
    console.error('Process assets error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
