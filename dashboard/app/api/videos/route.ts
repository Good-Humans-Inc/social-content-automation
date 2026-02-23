import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    let supabase
    try {
      supabase = createAdminClient()
    } catch {
      supabase = await createClient()
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const accountId = searchParams.get('account_id')

    // Fetch completed video jobs that have a video_url
    let query = supabase
      .from('video_jobs')
      .select('id, template_id, account_id, post_type, status, video_url, created_at, templates(caption), accounts(display_name)')
      .eq('status', 'completed')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (accountId) {
      query = query.eq('account_id', accountId)
    }

    const { data: jobVideos, error: jobError } = await query

    if (jobError) {
      console.error('video_jobs fetch error:', jobError.message)
      return NextResponse.json({ error: jobError.message }, { status: 500 })
    }

    // Also fetch from post_logs for backwards compatibility
    let logQuery = supabase
      .from('post_logs')
      .select('id, template_id, account_id, post_type, status, video_url, created_at, scheduled_time, accounts(display_name), templates(caption)')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (accountId) {
      logQuery = logQuery.eq('account_id', accountId)
    }

    const { data: logVideos } = await logQuery

    // Merge and deduplicate by video_url
    const allVideos = [...(jobVideos || []), ...(logVideos || [])]
    const seen = new Set<string>()
    const unique = allVideos.filter((v: { video_url?: string }) => {
      if (!v?.video_url || seen.has(v.video_url)) return false
      seen.add(v.video_url)
      return true
    })

    // Sort by created_at descending
    unique.sort((a: { created_at?: string }, b: { created_at?: string }) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )

    return NextResponse.json(unique.slice(0, limit))
  } catch (error: any) {
    console.error('GET /api/videos error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
