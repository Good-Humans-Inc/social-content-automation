import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await createClient()
    // Handle both Promise and direct params (for Next.js version compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const { id } = resolvedParams

    const { data, error } = await supabase
      .from('video_jobs')
      .select(`
        *,
        templates(id, persona, fandom, intensity, caption, overlay, tags),
        accounts(id, display_name, persona, env_id, cloud_phone_id)
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await createClient()
    // Handle both Promise and direct params (for Next.js version compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const { id } = resolvedParams
    const body = await request.json()

    // Validate job ID
    if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
      console.error('Invalid job ID received:', { id, type: typeof id, params: resolvedParams })
      return NextResponse.json({ error: 'Invalid job ID', details: `Received: ${id}` }, { status: 400 })
    }

    // Only allow updating specific fields
    const allowedFields = [
      'status',
      'progress',
      'logs',
      'error_message',
      'video_url',
      'render_path',
      'started_at',
      'completed_at',
    ]

    const updates: any = {}
    for (const field of allowedFields) {
      // Only include field if it exists in body and is not undefined
      if (field in body && body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // If status is being set to pending (retry), reset job state
    if (updates.status === 'pending') {
      updates.progress = 0
      updates.error_message = null
      updates.started_at = null
      updates.completed_at = null
      updates.video_url = null
      updates.render_path = null
      // Clear logs or keep them for history - keeping them for now
    }

    // If status is being set to processing, set started_at
    if (updates.status === 'processing' && !updates.started_at) {
      updates.started_at = new Date().toISOString()
    }

    // If status is being set to completed or failed, set completed_at
    if ((updates.status === 'completed' || updates.status === 'failed') && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('video_jobs')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        templates(id, persona, fandom, intensity, caption),
        accounts(id, display_name, persona)
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    // Handle both Promise and direct params (for Next.js version compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const { id } = resolvedParams

    // Fetch the job to get video_url and account_id before deletion
    const { data: job, error: fetchError } = await supabase
      .from('video_jobs')
      .select('id, video_url, account_id, status')
      .eq('id', id)
      .single()

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Delete video from Supabase Storage if it exists
    if (job.video_url) {
      try {
        // Extract storage path from video_url (path inside the bucket, no bucket prefix)
        // Format: https://{project}.supabase.co/storage/v1/object/public/videos/{account_id}/{filename}
        // remove() expects path within bucket: account_id/filename
        const urlPattern = /\/storage\/v1\/object\/public\/videos\/(.+)$/
        const match = job.video_url.match(urlPattern)
        
        if (match) {
          const storagePath = match[1]
          
          // Delete from storage using admin client
          const { error: storageError } = await adminSupabase.storage
            .from('videos')
            .remove([storagePath])

          if (storageError) {
            console.error(`Failed to delete video from storage: ${storageError.message}`)
            // Continue with database deletion even if storage deletion fails
            // (video might already be deleted or path might be incorrect)
          } else {
            console.log(`Successfully deleted video from storage: ${storagePath}`)
          }
        } else {
          console.warn(`Could not extract storage path from video_url: ${job.video_url}`)
        }
      } catch (storageErr: any) {
        console.error(`Error deleting video from storage: ${storageErr.message}`)
        // Continue with database deletion even if storage deletion fails
      }
    }

    // Delete the job from database
    const { data, error } = await supabase
      .from('video_jobs')
      .delete()
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      data,
      message: 'Job and video deleted successfully'
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
