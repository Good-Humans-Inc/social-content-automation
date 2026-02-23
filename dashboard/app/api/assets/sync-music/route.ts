import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Syncs files from the "music" storage bucket into the assets table.
 * Use this when files were uploaded directly to Supabase Storage (e.g. via dashboard)
 * and don't have corresponding asset rows - the app only shows music from the assets table.
 */
export async function POST() {
  try {
    const supabase = createAdminClient()

    const { data: files, error: listError } = await supabase.storage
      .from('music')
      .list('', { limit: 1000 })

    if (listError) {
      return NextResponse.json(
        { error: `Failed to list music bucket: ${listError.message}` },
        { status: 500 }
      )
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No files in music bucket' })
    }

    // Get existing assets that are in the music bucket (storage_path like 'music/%')
    const { data: existingAssets } = await supabase
      .from('assets')
      .select('storage_path')
      .like('storage_path', 'music/%')

    const existingPaths = new Set((existingAssets || []).map((a) => a.storage_path))

    let synced = 0
    for (const file of files) {
      if (!file.name || file.name === '.emptyFolderPlaceholder') continue
      const storagePath = `music/${file.name}`
      if (existingPaths.has(storagePath)) continue

      const { data: urlData } = supabase.storage.from('music').getPublicUrl(file.name)

      const { error: insertError } = await supabase.from('assets').insert({
        url: urlData.publicUrl,
        storage_path: storagePath,
        category: 'music',
        tags: [],
        metadata: {
          filename: file.name,
          bucket: 'music',
          ...(file.metadata && { metadata: file.metadata }),
        },
      })

      if (!insertError) {
        synced++
        existingPaths.add(storagePath)
      }
    }

    return NextResponse.json({
      synced,
      total_in_bucket: files.length,
      message: synced > 0 ? `Synced ${synced} file(s) from bucket to assets.` : 'All bucket files already in assets.',
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to sync music' },
      { status: 500 }
    )
  }
}
