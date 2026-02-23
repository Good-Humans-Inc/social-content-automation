import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Parse request body with better error handling
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { ids } = body

    if (!ids) {
      return NextResponse.json(
        { error: 'IDs array is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(ids)) {
      return NextResponse.json(
        { error: 'IDs must be an array' },
        { status: 400 }
      )
    }

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'IDs array cannot be empty' },
        { status: 400 }
      )
    }

    // Validate that all IDs are strings or numbers
    const invalidIds = ids.filter(id => typeof id !== 'string' && typeof id !== 'number')
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Invalid ID types found. All IDs must be strings or numbers.` },
        { status: 400 }
      )
    }

    // Use admin client for storage operations
    const adminSupabase = createAdminClient()

    // First, get the assets with their storage paths before deleting
    const { data: assetsToDelete, error: fetchError } = await supabase
      .from('assets')
      .select('id, storage_path')
      .in('id', ids)

    if (fetchError) {
      console.error('Error fetching assets for deletion:', fetchError)
      return NextResponse.json(
        { error: fetchError.message || 'Failed to fetch assets' },
        { status: 500 }
      )
    }

    // Delete files from storage
    if (assetsToDelete && assetsToDelete.length > 0) {
      // Group files by bucket for efficient deletion
      const filesByBucket: Record<string, string[]> = {}
      
      for (const asset of assetsToDelete) {
        if (asset.storage_path) {
          const storagePath = asset.storage_path
          let bucket = 'assets'
          let pathInBucket = storagePath
          
          if (storagePath.startsWith('music/')) {
            bucket = 'music'
            pathInBucket = storagePath.replace('music/', '')
          } else if (storagePath.startsWith('videos/')) {
            bucket = 'videos'
            pathInBucket = storagePath.replace('videos/', '')
          } else if (storagePath.startsWith('assets/')) {
            bucket = 'assets'
            pathInBucket = storagePath.replace('assets/', '')
          }
          
          if (!filesByBucket[bucket]) {
            filesByBucket[bucket] = []
          }
          filesByBucket[bucket].push(pathInBucket)
        }
      }

      // Delete from each bucket
      for (const [bucket, paths] of Object.entries(filesByBucket)) {
        try {
          const { error: storageError } = await adminSupabase.storage
            .from(bucket)
            .remove(paths)

          if (storageError) {
            console.error(`Failed to delete files from storage bucket ${bucket}:`, storageError)
            // Continue even if storage deletion fails (files might already be deleted)
          } else {
            console.log(`Successfully deleted ${paths.length} file(s) from storage bucket ${bucket}`)
          }
        } catch (storageErr: any) {
          console.error(`Error deleting files from storage bucket ${bucket}:`, storageErr)
          // Continue even if storage deletion fails
        }
      }
    }

    // Delete from database
    const { error, data } = await supabase
      .from('assets')
      .delete()
      .in('id', ids)
      .select()

    if (error) {
      console.error('Supabase delete error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to delete assets' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      deleted: ids.length,
      data
    })
  } catch (error) {
    console.error('Bulk delete error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
