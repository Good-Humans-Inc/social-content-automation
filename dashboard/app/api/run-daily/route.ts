import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dry_run === true

    // 1. Load all accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, display_name, persona, daily_post_target, intensity_ratio, preferred_fandoms, preferred_intensity')

    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No accounts configured' }, { status: 400 })
    }

    // 2. Count how many videos each account has already posted today
    const today = new Date().toISOString().split('T')[0]
    const startOfDay = `${today}T00:00:00.000Z`
    const endOfDay = `${today}T23:59:59.999Z`

    // Count all video/slideshow submissions today (pending, success, or failed) so we don't over-post
    const { data: todayLogs } = await supabase
      .from('logs')
      .select('account_id, type')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .in('type', ['video', 'slideshow'])

    const postedToday: Record<string, number> = {}
    for (const log of todayLogs || []) {
      postedToday[log.account_id] = (postedToday[log.account_id] || 0) + 1
    }

    // 3. For each account, find completed + unposted videos
    const plan: Array<{
      account_id: string
      display_name: string
      daily_target: number
      already_posted: number
      remaining: number
      available_videos: number
      videos_to_post: Array<{ id: string; template_id: string; video_url: string }>
    }> = []

    for (const account of accounts) {
      const target = account.daily_post_target ?? 2
      const posted = postedToday[account.id] || 0
      const remaining = Math.max(0, target - posted)

      // Fetch completed videos for this account that haven't been posted yet
      const { data: readyVideos } = await supabase
        .from('video_jobs')
        .select('id, template_id, video_url')
        .eq('account_id', account.id)
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .is('posted_at', null)
        .order('created_at', { ascending: true })
        .limit(remaining > 0 ? remaining : 0)

      const videosToPost = (readyVideos || []).slice(0, remaining)

      // Count total available (not just what we'll post)
      const { count: totalAvailable } = await supabase
        .from('video_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', account.id)
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .is('posted_at', null)

      plan.push({
        account_id: account.id,
        display_name: account.display_name,
        daily_target: target,
        already_posted: posted,
        remaining,
        available_videos: totalAvailable ?? 0,
        videos_to_post: videosToPost as Array<{ id: string; template_id: string; video_url: string }>,
      })
    }

    const totalToPost = plan.reduce((s, p) => s + p.videos_to_post.length, 0)

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        date: today,
        plan: plan.map((p) => ({
          account_id: p.account_id,
          display_name: p.display_name,
          daily_target: p.daily_target,
          already_posted: p.already_posted,
          remaining: p.remaining,
          available_videos: p.available_videos,
          will_post: p.videos_to_post.length,
          video_ids: p.videos_to_post.map((v) => v.id),
        })),
        total_to_post: totalToPost,
      })
    }

    // 4. Execute: upload each video via GeeLark and mark as posted
    const results: Array<{
      video_job_id: string
      account_id: string
      template_id: string
      status: 'success' | 'failed'
      error?: string
    }> = []

    for (const item of plan) {
      for (const video of item.videos_to_post) {
        try {
          // Call the existing upload-geelark endpoint internally
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000'

          const uploadRes = await fetch(`${baseUrl}/api/videos/upload-geelark`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              video_url: video.video_url,
              account_id: item.account_id,
              template_id: video.template_id,
            }),
          })

          const uploadData = await uploadRes.json()

          if (!uploadRes.ok) {
            results.push({
              video_job_id: video.id,
              account_id: item.account_id,
              template_id: video.template_id,
              status: 'failed',
              error: uploadData.error || 'Upload failed',
            })
            continue
          }

          // Mark video_job as posted
          await supabase
            .from('video_jobs')
            .update({ posted_at: new Date().toISOString() })
            .eq('id', video.id)

          // Mark the template as used
          await supabase
            .from('templates')
            .update({
              used: {
                timestamp: new Date().toISOString(),
                account_id: item.account_id,
                account_display_name: item.display_name,
                status: 'posted',
              },
            })
            .eq('id', video.template_id)
            .is('used', null)

          results.push({
            video_job_id: video.id,
            account_id: item.account_id,
            template_id: video.template_id,
            status: 'success',
          })
        } catch (err) {
          results.push({
            video_job_id: video.id,
            account_id: item.account_id,
            template_id: video.template_id,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    return NextResponse.json({
      dry_run: false,
      date: today,
      plan: plan.map((p) => ({
        account_id: p.account_id,
        display_name: p.display_name,
        daily_target: p.daily_target,
        already_posted: p.already_posted,
        remaining: p.remaining,
        available_videos: p.available_videos,
        will_post: p.videos_to_post.length,
      })),
      total_posted: successCount,
      total_failed: failedCount,
      results,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
