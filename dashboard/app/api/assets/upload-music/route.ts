import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Supported music tags for automatic extraction
const MUSIC_TAGS = ['japan', 'anime', 'edm', 'phonk', 'lofi', 'trap', 'piano']

// Extract tags from filename
function extractTagsFromFilename(filename: string): string[] {
  const lowerFilename = filename.toLowerCase()
  const extractedTags: string[] = []
  
  MUSIC_TAGS.forEach(tag => {
    if (lowerFilename.includes(tag)) {
      extractedTags.push(tag)
    }
  })
  
  return extractedTags
}

export async function POST(request: NextRequest) {
  try {
    // Use admin client to bypass RLS for music uploads
    const supabase = createAdminClient()
    
    // Parse FormData from request (exact same approach as working upload route)
    const formData = await request.formData()
    
    // Support both 'file' (single) and 'files' (multiple) for backward compatibility
    let file: File | null = null
    if (formData.has('file')) {
      file = formData.get('file') as File
    } else if (formData.has('files')) {
      const files = formData.getAll('files')
      file = files[0] as File // Take first file if multiple provided
    }
    
    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No valid file provided' }, { status: 400 })
    }

    // Extract tags from filename
    const filename = file.name.replace(/\.[^/.]+$/, '') // Remove extension
    const extractedTags = extractTagsFromFilename(filename)

    // Upload to Supabase Storage (music bucket)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${file.name}`
    const storagePath = fileName // Store directly in music bucket root

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('music')
      .upload(storagePath, buffer, {
        contentType: `audio/${fileExt}`,
        upsert: false,
      })

    if (uploadError) {
      console.error(`Error uploading file ${file.name}:`, uploadError)
      return NextResponse.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Get public URL from music bucket
    const { data: urlData } = supabase.storage
      .from('music')
      .getPublicUrl(storagePath)

    // Create asset record in database
    // Store full path with bucket prefix for clarity: 'music/filename'
    const fullStoragePath = `music/${storagePath}`
    const { data: assetData, error: dbError } = await supabase
      .from('assets')
      .insert({
        url: urlData.publicUrl,
        storage_path: fullStoragePath, // Store as 'music/filename' for reference
        category: 'music',
        tags: extractedTags,
        metadata: {
          filename: file.name,
          size: file.size,
          type: file.type,
          bucket: 'music', // Store bucket name in metadata for easy reference
        },
      })
      .select()
      .single()

    if (dbError) {
      console.error(`Error inserting asset for ${file.name}:`, dbError)
      // Try to clean up uploaded file
      await supabase.storage.from('music').remove([storagePath])
      return NextResponse.json(
        { error: `Failed to save asset: ${dbError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { 
        data: assetData,
        message: `Successfully uploaded music file: ${file.name}`
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Music upload error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}
