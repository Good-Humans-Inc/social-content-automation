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

    let logQuery = supabase
      .from('logs')
      .select('id, template_id, account_id, type, status, video_url, created_at, scheduled_time, accounts(display_name), templates(caption)')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (accountId) {
      logQuery = logQuery.eq('account_id', accountId)
    }

    const { data: logVideos } = await logQuery
    const logVideosWithPostType = (logVideos || []).map((v: { type?: string; [k: string]: unknown }) => ({
      ...v,
      post_type: v.type ?? 'video',
    }))

    const allVideos = [...(jobVideos || []), ...logVideosWithPostType]
    const seen = new Set<string>()
    const unique = allVideos.filter((v: (typeof allVideos)[number]) => {
      const url = v && 'video_url' in v ? v.video_url : undefined
      if (!url || seen.has(url)) return false
      seen.add(url)
      return true
    })

    // Sort by created_at descending (use 'in' check since union type may not have created_at)
    unique.sort((a, b) => {
      const aTime = 'created_at' in a && a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = 'created_at' in b && b.created_at ? new Date(b.created_at).getTime() : 0
      return bTime - aTime
    })

    return NextResponse.json(unique.slice(0, limit))
  } catch (error: any) {
    console.error('GET /api/videos error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
