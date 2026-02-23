import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Reorganize assets to fix nested folder structure
 * Moves files from assets/{category}/{category}/ to assets/{category}/{character}/
 * Updates database records accordingly
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const body = await request.json()
    const { category = 'lads' } = body

    console.log(`[REORGANIZE] Starting reorganization for category: ${category}`)

    // Find all assets with problematic structure:
    // 1. category/subcategory where subcategory == category (lads/lads, jjk/jjk)
    // 2. category/subcategory where subcategory is 'lads' or 'general' or 'other' (needs character extraction)
    const { data: assets, error: fetchError } = await supabase
      .from('assets')
      .select('id, storage_path, category, subcategory, metadata')
      .eq('category', category)
      .in('subcategory', [category, 'lads', 'general', 'other']) // Handle multiple problematic cases

    if (fetchError) {
      console.error('[REORGANIZE] Error fetching assets:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!assets || assets.length === 0) {
      return NextResponse.json({ 
        message: `No assets found with category=${category} that need reorganization`,
        moved: 0,
        updated: 0
      })
    }

    console.log(`[REORGANIZE] Found ${assets.length} assets to reorganize`)

    let movedCount = 0
    let updatedCount = 0
    const errors: string[] = []

    for (const asset of assets) {
      try {
        // Extract character from metadata
        const character = asset.metadata?.character || 
                         asset.metadata?.character_name || 
                         null

        if (!character || character === 'unknown' || character === null) {
          // No character found - move to 'general' subfolder
          const newSubcategory = 'general'
          const newStoragePath = asset.storage_path?.replace(
            `/${category}/${category}/`,
            `/${category}/${newSubcategory}/`
          )

          if (newStoragePath && newStoragePath !== asset.storage_path) {
            // Move file in storage
            const oldPath = asset.storage_path
            const { error: moveError } = await supabase.storage
              .from('assets')
              .move(oldPath, newStoragePath)

            if (moveError) {
              console.error(`[REORGANIZE] Error moving file ${oldPath}:`, moveError)
              errors.push(`Failed to move ${oldPath}: ${moveError.message}`)
              continue
            }

            // Update database
            const { error: updateError } = await supabase
              .from('assets')
              .update({
                storage_path: newStoragePath,
                subcategory: newSubcategory
              })
              .eq('id', asset.id)

            if (updateError) {
              console.error(`[REORGANIZE] Error updating database for ${asset.id}:`, updateError)
              errors.push(`Failed to update database for ${asset.id}: ${updateError.message}`)
              // Try to move file back
              await supabase.storage.from('assets').move(newStoragePath, oldPath)
              continue
            }

            movedCount++
            updatedCount++
            console.log(`[REORGANIZE] Moved ${oldPath} -> ${newStoragePath} (no character)`)
          }
        } else {
          // Character found - move to character subfolder
          const sanitizedChar = character.replace(/\s+/g, '_').toLowerCase()
          const newSubcategory = sanitizedChar
          const newStoragePath = asset.storage_path?.replace(
            `/${category}/${category}/`,
            `/${category}/${newSubcategory}/`
          )

          if (newStoragePath && newStoragePath !== asset.storage_path) {
            // Move file in storage
            const oldPath = asset.storage_path
            const { error: moveError } = await supabase.storage
              .from('assets')
              .move(oldPath, newStoragePath)

            if (moveError) {
              console.error(`[REORGANIZE] Error moving file ${oldPath}:`, moveError)
              errors.push(`Failed to move ${oldPath}: ${moveError.message}`)
              continue
            }

            // Update database
            const { error: updateError } = await supabase
              .from('assets')
              .update({
                storage_path: newStoragePath,
                subcategory: newSubcategory
              })
              .eq('id', asset.id)

            if (updateError) {
              console.error(`[REORGANIZE] Error updating database for ${asset.id}:`, updateError)
              errors.push(`Failed to update database for ${asset.id}: ${updateError.message}`)
              // Try to move file back
              await supabase.storage.from('assets').move(newStoragePath, oldPath)
              continue
            }

            movedCount++
            updatedCount++
            console.log(`[REORGANIZE] Moved ${oldPath} -> ${newStoragePath} (character: ${character})`)
          }
        }
      } catch (error: any) {
        console.error(`[REORGANIZE] Error processing asset ${asset.id}:`, error)
        errors.push(`Error processing ${asset.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reorganization complete for ${category}`,
      moved: movedCount,
      updated: updatedCount,
      total: assets.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('[REORGANIZE] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
