import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Sync files from Supabase Storage to the assets database table
 * Scans storage bucket and adds any missing files to the database
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const body = await request.json()
    const { category, subcategory } = body

    // If category/subcategory provided, only sync that specific folder
    const targetPath = category && subcategory 
      ? `assets/${category}/${subcategory}/`
      : 'assets/'

    console.log(`[SYNC] Starting sync from storage path: ${targetPath}`)

    // Get all files from storage
    const { data: files, error: listError } = await supabase.storage
      .from('assets')
      .list(targetPath, {
        limit: 10000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      })

    if (listError) {
      console.error('[SYNC] Error listing files:', listError)
      return NextResponse.json(
        { error: `Failed to list files: ${listError.message}` },
        { status: 500 }
      )
    }

    if (!files || files.length === 0) {
      return NextResponse.json({
        message: 'No files found in storage',
        synced: 0,
        total: 0,
        skipped: 0
      })
    }

    console.log(`[SYNC] Found ${files.length} files in storage`)

    // Get existing assets from database (scoped to folder if category/subcategory provided)
    let existingAssetsQuery = supabase
      .from('assets')
      .select('storage_path, url')
    
    // If syncing a specific folder, only check assets in that folder
    if (category && subcategory) {
      existingAssetsQuery = existingAssetsQuery
        .eq('category', category)
        .eq('subcategory', subcategory)
    }

    const { data: existingAssets, error: dbError } = await existingAssetsQuery

    if (dbError) {
      return NextResponse.json(
        { error: `Failed to fetch existing assets: ${dbError.message}` },
        { status: 500 }
      )
    }

    // Create a Set of existing storage paths for quick lookup
    const existingPaths = new Set(
      (existingAssets || [])
        .map(asset => asset.storage_path)
        .filter(Boolean)
    )

    console.log(`[SYNC] Found ${existingPaths.size} existing assets in database${category && subcategory ? ` for ${category}/${subcategory}` : ''}`)

    let syncedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    // Process each file
    for (const file of files) {
      try {
        // Skip folders
        if (!file.name || file.name.endsWith('/')) {
          continue
        }

        // Construct full storage path
        const storagePath = targetPath === 'assets/'
          ? `assets/${file.name}`
          : `${targetPath}${file.name}`

        // Check if already in database
        if (existingPaths.has(storagePath)) {
          skippedCount++
          continue
        }

        // Extract category and subcategory from path
        // Path format: assets/{category}/{subcategory}/{filename}
        const pathParts = storagePath.split('/').filter(Boolean)
        let extractedCategory: string | null = null
        let extractedSubcategory: string | null = null

        if (pathParts.length >= 3 && pathParts[0] === 'assets') {
          extractedCategory = pathParts[1]
          extractedSubcategory = pathParts[2]
        } else if (pathParts.length === 2 && pathParts[0] === 'assets') {
          // Just assets/{category}/{filename} - no subcategory
          extractedCategory = pathParts[1]
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('assets')
          .getPublicUrl(storagePath)

        // Insert into database
        const { error: insertError } = await supabase
          .from('assets')
          .insert({
            url: urlData.publicUrl,
            storage_path: storagePath,
            category: extractedCategory,
            subcategory: extractedSubcategory,
            fandom: extractedCategory || null,
            metadata: {
              synced_from_storage: true,
              synced_at: new Date().toISOString()
            }
          })

        if (insertError) {
          errors.push(`File ${storagePath}: ${insertError.message}`)
        } else {
          syncedCount++
          // Add to existing paths to avoid duplicates in this batch
          existingPaths.add(storagePath)
        }
      } catch (error: any) {
        errors.push(`File ${file.name}: ${error.message}`)
      }
    }

    return NextResponse.json({
      message: `Synced ${syncedCount} files, skipped ${skippedCount} existing files`,
      synced: syncedCount,
      skipped: skippedCount,
      total: files.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit errors to first 10
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
