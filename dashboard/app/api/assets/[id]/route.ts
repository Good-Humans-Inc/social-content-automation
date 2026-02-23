import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use admin client to bypass RLS for updates
    const supabase = createAdminClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('assets')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use admin client to bypass RLS for deletions
    const supabase = createAdminClient()

    // First get the asset to find storage path for cleanup
    const { data: asset } = await supabase
      .from('assets')
      .select('storage_path')
      .eq('id', id)
      .single()

    // Delete from database
    const { error } = await supabase.from('assets').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Try to delete from storage if path exists
    if (asset?.storage_path) {
      const storagePath = asset.storage_path
      // Determine bucket from path
      let bucket = 'assets'
      let pathInBucket = storagePath
      
      if (storagePath.startsWith('music/')) {
        bucket = 'music'
        pathInBucket = storagePath.replace('music/', '')
      } else if (storagePath.startsWith('videos/')) {
        bucket = 'videos'
        pathInBucket = storagePath.replace('videos/', '')
      } else if (storagePath.startsWith('assets/')) {
        // For assets bucket, remove the 'assets/' prefix to get the path within the bucket
        bucket = 'assets'
        pathInBucket = storagePath.replace('assets/', '')
      }
      
      // Attempt to delete from storage
      try {
        const { error: storageError } = await supabase.storage
          .from(bucket)
          .remove([pathInBucket])

        if (storageError) {
          console.error(`Failed to delete file from storage bucket ${bucket} at path ${pathInBucket}:`, storageError)
          // Continue even if storage deletion fails (file might already be deleted)
        } else {
          console.log(`Successfully deleted file from storage bucket ${bucket} at path ${pathInBucket}`)
        }
      } catch (storageErr: any) {
        console.error(`Error deleting file from storage bucket ${bucket}:`, storageErr)
        // Continue even if storage deletion fails
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
