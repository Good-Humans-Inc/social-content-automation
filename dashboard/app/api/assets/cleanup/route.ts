import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { limit, dryRun = false } = body
    
    console.log('[DEBUG] Starting asset cleanup...')
    console.log(`[DEBUG] Dry run: ${dryRun}`)
    
    // Fetch all assets
    let query = supabase
      .from('assets')
      .select('id, url, storage_path')
      .order('created_at', { ascending: false })
    
    if (limit) {
      query = query.limit(limit)
    }
    
    const { data: assets, error } = await query
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    if (!assets || assets.length === 0) {
      return NextResponse.json({
        message: 'No assets found',
        deleted: 0,
        checked: 0,
        errors: []
      })
    }
    
    console.log(`[DEBUG] Checking ${assets.length} assets...`)
    
    const toDelete: string[] = []
    const errors: string[] = []
    let checked = 0
    
    // Check each asset
    for (const asset of assets) {
      checked++
      const assetId = asset.id
      let exists = false
      
      try {
        // Method 1: Check storage_path directly by trying to get file info
        if (asset.storage_path) {
          // Extract bucket and path from storage_path
          // Format is usually: "assets/{category}/{subcategory}/filename.ext"
          const pathParts = asset.storage_path.split('/')
          if (pathParts.length >= 2) {
            const bucket = pathParts[0] // Usually "assets"
            const filePath = pathParts.slice(1).join('/')
            
            // Try to get the file directly - this will fail if it doesn't exist
            const { data: fileData, error: fileError } = await supabase.storage
              .from(bucket)
              .list(filePath.split('/').slice(0, -1).join('/') || '', {
                limit: 1000,
                search: filePath.split('/').pop() || ''
              })
            
            // Also try to get file info directly
            if (fileError || !fileData || fileData.length === 0) {
              // Try alternative: check if we can get the file
              const { error: directError } = await supabase.storage
                .from(bucket)
                .download(filePath)
              
              if (!directError) {
                exists = true
              }
            } else {
              exists = true
            }
          }
        }
        
        // Method 2: If storage_path check didn't work, try checking the URL
        if (!exists && asset.url) {
          try {
            // Check if it's a Supabase storage URL - extract path and check directly
            const supabaseUrlMatch = asset.url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/)
            if (supabaseUrlMatch) {
              const bucket = supabaseUrlMatch[1]
              const filePath = supabaseUrlMatch[2].split('?')[0] // Remove query params
              
              // Try to download the file (small request, just to check existence)
              const { error: downloadError } = await supabase.storage
                .from(bucket)
                .download(filePath)
              
              if (!downloadError) {
                exists = true
              }
            } else {
              // Not a Supabase URL, try HEAD request
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 5000)
              
              const response = await fetch(asset.url, { 
                method: 'HEAD', 
                signal: controller.signal,
                cache: 'no-store' // Don't use cache
              })
              
              clearTimeout(timeoutId)
              
              if (response.ok && response.status === 200) {
                exists = true
              }
            }
          } catch (fetchError: any) {
            // URL doesn't exist, is unreachable, or timed out
            exists = false
          }
        }
        
        if (!exists) {
          toDelete.push(assetId)
          console.log(`[DEBUG] Asset ${assetId.substring(0, 8)}... marked for deletion (file not found)`)
        }
      } catch (error: any) {
        errors.push(`Asset ${assetId.substring(0, 8)}...: ${error.message}`)
        console.error(`[DEBUG] Error checking asset ${assetId}:`, error)
      }
      
      // Log progress every 100 assets
      if (checked % 100 === 0) {
        console.log(`[DEBUG] Checked ${checked}/${assets.length} assets...`)
      }
    }
    
    let deleted = 0
    
    // Delete assets if not dry run
    if (!dryRun && toDelete.length > 0) {
      console.log(`[DEBUG] Deleting ${toDelete.length} assets...`)
      
      // Delete in batches to avoid overwhelming the database
      const BATCH_SIZE = 100
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE)
        const { error: deleteError } = await supabase
          .from('assets')
          .delete()
          .in('id', batch)
        
        if (deleteError) {
          errors.push(`Batch ${i / BATCH_SIZE + 1}: ${deleteError.message}`)
          console.error(`[DEBUG] Error deleting batch:`, deleteError)
        } else {
          deleted += batch.length
          console.log(`[DEBUG] Deleted batch ${i / BATCH_SIZE + 1}: ${batch.length} assets`)
        }
      }
    }
    
    return NextResponse.json({
      message: dryRun 
        ? `Found ${toDelete.length} assets with missing images (dry run - nothing deleted)`
        : `Cleaned up ${deleted} assets with missing images`,
      checked,
      found: toDelete.length,
      deleted: dryRun ? 0 : deleted,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit errors shown
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
