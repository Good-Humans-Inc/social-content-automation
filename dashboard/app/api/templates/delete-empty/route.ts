import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Consider a template "empty" if it has no overlay content AND no caption.
 * - overlay: null, or [] or empty array
 * - caption: null, or blank/whitespace
 */
function isEmpty(overlay: unknown, caption: unknown): boolean {
  const hasOverlay =
    Array.isArray(overlay) && overlay.length > 0
  const hasCaption =
    caption != null && String(caption).trim() !== ''
  return !hasOverlay && !hasCaption
}

/**
 * POST /api/templates/delete-empty
 * Deletes templates that are empty (no overlay content and no caption).
 * Skips templates that are referenced in post_logs or video_jobs to avoid FK errors.
 */
export async function POST() {
  try {
    const supabase = createAdminClient()

    const { data: allTemplates, error: fetchError } = await supabase
      .from('templates')
      .select('id, overlay, caption')

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const emptyIds = (allTemplates || [])
      .filter((t: { overlay: unknown; caption: unknown }) => isEmpty(t.overlay, t.caption))
      .map((t: { id: string }) => t.id)

    if (emptyIds.length === 0) {
      return NextResponse.json({
        deleted: 0,
        skipped: 0,
        message: 'No empty templates found.',
      })
    }

    // Don't delete templates that are referenced in post_logs or video_jobs
    const [postLogsRes, videoJobsRes] = await Promise.all([
      supabase.from('post_logs').select('template_id').in('template_id', emptyIds),
      supabase.from('video_jobs').select('template_id').in('template_id', emptyIds),
    ])

    const usedIds = new Set<string>()
    for (const row of postLogsRes.data || []) {
      usedIds.add((row as { template_id: string }).template_id)
    }
    for (const row of videoJobsRes.data || []) {
      usedIds.add((row as { template_id: string }).template_id)
    }

    const toDelete = emptyIds.filter((id) => !usedIds.has(id))
    const skipped = emptyIds.length - toDelete.length

    if (toDelete.length === 0) {
      return NextResponse.json({
        deleted: 0,
        skipped,
        message: `All ${emptyIds.length} empty template(s) are in use (post_logs or video_jobs). None deleted.`,
      })
    }

    const { error: deleteError } = await supabase
      .from('templates')
      .delete()
      .in('id', toDelete)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
      deleted: toDelete.length,
      skipped,
      ids: toDelete,
      message:
        skipped > 0
          ? `Deleted ${toDelete.length} empty template(s). ${skipped} skipped (in use).`
          : `Deleted ${toDelete.length} empty template(s).`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
