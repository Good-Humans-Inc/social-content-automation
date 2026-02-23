import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Find and delete orphaned files in storage bucket
 * Orphaned files are files in storage that don't have corresponding database records
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { category, subcategory, dryRun = true, limit } = body
    
    console.log('[CLEANUP] Starting orphaned files cleanup...')
    console.log(`[CLEANUP] Dry run: ${dryRun}`)
    if (category) console.log(`[CLEANUP] Category filter: ${category}`)
    if (subcategory) console.log(`[CLEANUP] Subcategory filter: ${subcategory}`)
    
    // Build target path for storage listing
    let targetPath = ''
    if (category && subcategory) {
      targetPath = `${category}/${subcategory}/`
    } else if (category) {
      targetPath = `${category}/`
    } else {
      targetPath = ''
    }
    
    console.log(`[CLEANUP] Listing files from storage path: ${targetPath || 'root'}`)
    
    // Recursive function to list all files in storage
    const listAllFiles = async (path: string = ''): Promise<string[]> => {
      const files: string[] = []
      
      const { data: items, error } = await supabase.storage
        .from('assets')
        .list(path, {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        })
      
      if (error) {
        console.warn(`[CLEANUP] Error listing path ${path}:`, error.message)
        return files
      }
      
      if (!items || items.length === 0) {
        return files
      }
      
      for (const item of items) {
        if (!item.name) continue
        
        const itemPath = path ? `${path}/${item.name}` : item.name
        
        // Check if it's a folder (folders typically have null id or metadata)
        // Files have id and metadata
        if (item.id === null || item.metadata === null) {
          // It's a folder, recurse into it
          const subFiles = await listAllFiles(itemPath)
          files.push(...subFiles)
        } else {
          // It's a file, add it
          const storagePath = `assets/${itemPath}`
          files.push(storagePath)
        }
      }
      
      return files
    }
    
    // Get all files from storage bucket recursively
    console.log(`[CLEANUP] Recursively listing files from: ${targetPath || 'root'}`)
    const allFiles = await listAllFiles(targetPath)
    
    console.log(`[CLEANUP] Found ${allFiles.length} files in storage`)
    
    // Get all storage_paths from database
    let dbQuery = supabase
      .from('assets')
      .select('storage_path')
      .not('storage_path', 'is', null)
    
    if (category) {
      dbQuery = dbQuery.eq('category', category)
    }
    if (subcategory) {
      dbQuery = dbQuery.eq('subcategory', subcategory)
    }
    
    const { data: dbAssets, error: dbError } = await dbQuery
    
    if (dbError) {
      return NextResponse.json(
        { error: `Failed to fetch database assets: ${dbError.message}` },
        { status: 500 }
      )
    }
    
    // Create a set of storage paths that exist in database
    const dbPaths = new Set(
      (dbAssets || [])
        .map(asset => asset.storage_path)
        .filter(Boolean)
    )
    
    console.log(`[CLEANUP] Found ${dbPaths.size} assets in database`)
    
    // Find orphaned files (files in storage but not in database)
    const orphanedFiles = allFiles.filter(filePath => !dbPaths.has(filePath))
    
    console.log(`[CLEANUP] Found ${orphanedFiles.length} orphaned files`)
    
    if (orphanedFiles.length === 0) {
      return NextResponse.json({
        message: 'No orphaned files found',
        checked: allFiles.length,
        orphaned: 0,
        deleted: 0
      })
    }
    
    // Limit if specified
    const filesToProcess = limit ? orphanedFiles.slice(0, limit) : orphanedFiles
    
    // Delete orphaned files if not dry run
    let deleted = 0
    const errors: string[] = []
    
    if (!dryRun) {
      console.log(`[CLEANUP] Deleting ${filesToProcess.length} orphaned files...`)
      
      // Remove 'assets/' prefix from all paths to get paths within bucket
      const pathsInBucket = filesToProcess.map(filePath => filePath.replace('assets/', ''))
      
      // Delete in batches to avoid overwhelming the API
      const BATCH_SIZE = 100
      for (let i = 0; i < pathsInBucket.length; i += BATCH_SIZE) {
        const batch = pathsInBucket.slice(i, i + BATCH_SIZE)
        
        try {
          const { error: deleteError } = await supabase.storage
            .from('assets')
            .remove(batch)
          
          if (deleteError) {
            const errorMsg = `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${deleteError.message}`
            errors.push(errorMsg)
            console.error(`[CLEANUP] ${errorMsg}`)
          } else {
            deleted += batch.length
            console.log(`[CLEANUP] Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} file(s)`)
          }
        } catch (err: any) {
          const errorMsg = `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`
          errors.push(errorMsg)
          console.error(`[CLEANUP] ${errorMsg}`)
        }
      }
    } else {
      console.log(`[CLEANUP] Dry run - would delete ${filesToProcess.length} files`)
      // Show sample of files that would be deleted
      const sample = filesToProcess.slice(0, 10)
      console.log('[CLEANUP] Sample files that would be deleted:', sample)
    }
    
    return NextResponse.json({
      message: dryRun
        ? `Found ${orphanedFiles.length} orphaned files (dry run - nothing deleted)`
        : `Cleaned up ${deleted} orphaned files`,
      checked: allFiles.length,
      orphaned: orphanedFiles.length,
      deleted: dryRun ? 0 : deleted,
      sampleFiles: filesToProcess.slice(0, 20), // Show first 20 as sample
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    })
  } catch (error: any) {
    console.error('[CLEANUP] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
