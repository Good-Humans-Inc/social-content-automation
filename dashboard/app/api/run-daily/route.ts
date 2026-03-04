import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const LONDON_TZ = 'Europe/London'

/** Parse "YYYY-MM-DD" and "HH:mm" in London timezone and return the UTC Date. */
function parseLondonDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const rough = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(rough)
  const tzHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0')
  const tzMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0')
  const tzDay = parseInt(parts.find((p) => p.type === 'day')?.value || '0')
  const diffMinutes =
    (tzDay - rough.getUTCDate()) * 1440 +
    (tzHour - rough.getUTCHours()) * 60 +
    (tzMinute - rough.getUTCMinutes())
  return new Date(rough.getTime() - diffMinutes * 60000)
}

/** Get today's date in London as YYYY-MM-DD. */
function getTodayInLondon(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value || ''
  const m = parts.find((p) => p.type === 'month')?.value || ''
  const d = parts.find((p) => p.type === 'day')?.value || ''
  return `${y}-${m}-${d}`
}

/** Compute schedule_minutes from now until the next occurrence of HH:mm London (or today if in future). */
function scheduleMinutesFromLondonTime(scheduleAtLondon: string, scheduleDate?: string): number {
  const dateStr = scheduleDate || getTodayInLondon()
  let targetUtc = parseLondonDateTimeToUtc(dateStr, scheduleAtLondon)
  const now = Date.now()
  if (targetUtc.getTime() <= now) {
    const [y, mo, d] = dateStr.split('-').map(Number)
    const nextDay = new Date(Date.UTC(y, mo - 1, d + 1))
    const tomorrowStr = nextDay.toISOString().slice(0, 10)
    targetUtc = parseLondonDateTimeToUtc(tomorrowStr, scheduleAtLondon)
  }
  return Math.max(0, Math.round((targetUtc.getTime() - now) / 60000))
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dry_run === true
    const overrides: Record<string, { will_post?: number; video_ids?: string[] }> | undefined = body.overrides
    let scheduleMinutes: number
    if (typeof body.schedule_at_london === 'string' && /^\d{1,2}:\d{2}$/.test(body.schedule_at_london.trim())) {
      scheduleMinutes = scheduleMinutesFromLondonTime(
        body.schedule_at_london.trim(),
        typeof body.schedule_date === 'string' ? body.schedule_date : undefined
      )
    } else if (typeof body.schedule_minutes === 'number') {
      scheduleMinutes = Math.max(0, body.schedule_minutes)
    } else {
      scheduleMinutes = scheduleMinutesFromLondonTime('20:00')
    }

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

    // Count success + pending video/slideshow posts today so "X/2 posted" and remaining slots include scheduled
    const { data: todayLogs } = await supabase
      .from('logs')
      .select('account_id, type')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .in('type', ['video', 'slideshow'])
      .in('status', ['success', 'pending'])

    const postedToday: Record<string, number> = {}
    for (const log of todayLogs || []) {
      postedToday[log.account_id] = (postedToday[log.account_id] || 0) + 1
    }

    // 3. For each account, find completed + unposted videos
    type VideoDetail = {
      id: string; template_id: string; video_url: string; created_at: string;
      templates?: { caption: string; fandom: string; intensity: string } | null
    }
    const plan: Array<{
      account_id: string
      display_name: string
      daily_target: number
      already_posted: number
      remaining: number
      available_videos: number
      all_available: VideoDetail[]
      videos_to_post: VideoDetail[]
    }> = []

    for (const account of accounts) {
      const target = account.daily_post_target ?? 2
      const posted = postedToday[account.id] || 0
      const remaining = Math.max(0, target - posted)

      // Fetch all completed + unposted videos for this account (for selection UI)
      const { data: readyVideos } = await supabase
        .from('video_jobs')
        .select('id, template_id, video_url, created_at, templates(caption, fandom, intensity)')
        .eq('account_id', account.id)
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .is('posted_at', null)
        .order('created_at', { ascending: true })

      const allAvailable = (readyVideos || []) as Array<{
        id: string; template_id: string; video_url: string; created_at: string;
        templates?: { caption: string; fandom: string; intensity: string } | null
      }>

      // Default selection: first N where N = remaining (or overridden)
      const accountOverride = overrides?.[account.id]
      const willPostCount = accountOverride?.will_post ?? remaining
      let videosToPost: typeof allAvailable

      const maxPostPerAccount = 2
      if (accountOverride?.video_ids?.length) {
        const idSet = new Set(accountOverride.video_ids)
        videosToPost = allAvailable.filter((v) => idSet.has(v.id)).slice(0, maxPostPerAccount)
      } else {
        videosToPost = allAvailable.slice(0, Math.min(maxPostPerAccount, Math.max(0, willPostCount)))
      }

      plan.push({
        account_id: account.id,
        display_name: account.display_name,
        daily_target: target,
        already_posted: posted,
        remaining,
        available_videos: allAvailable.length,
        all_available: allAvailable,
        videos_to_post: videosToPost,
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
          all_videos: p.all_available.map((v) => ({
            id: v.id,
            template_id: v.template_id,
            video_url: v.video_url,
            caption: v.templates?.caption || '',
            fandom: v.templates?.fandom || '',
            intensity: v.templates?.intensity || '',
            created_at: v.created_at,
          })),
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
              schedule_minutes: scheduleMinutes,
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
