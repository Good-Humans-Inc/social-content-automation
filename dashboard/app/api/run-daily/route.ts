import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dry_run === true

    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, display_name, persona, daily_post_target, intensity_ratio, preferred_fandoms, preferred_intensity')

    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No accounts configured' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const startOfDay = `${today}T00:00:00.000Z`
    const endOfDay = `${today}T23:59:59.999Z`

    const { data: todayLogs } = await supabase
      .from('logs')
      .select('account_id, status, type, templates(intensity)')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .eq('status', 'success')
      .in('type', ['video', 'slideshow'])

    const postsByAccount: Record<string, number> = {}
    for (const log of todayLogs || []) {
      postsByAccount[log.account_id] = (postsByAccount[log.account_id] || 0) + 1
    }

    const plan: Array<{
      account_id: string
      display_name: string
      daily_target: number
      already_posted: number
      remaining: number
      next_intensity: string | null
    }> = []

    for (const account of accounts) {
      const target = account.daily_post_target ?? 2
      const posted = postsByAccount[account.id] || 0
      const remaining = Math.max(0, target - posted)

      let nextIntensity: string | null = null
      if (remaining > 0) {
        const ratio = account.intensity_ratio ?? { T0: 0.5, T1: 0.3, T2: 0.2 }
        const byIntensity: Record<string, number> = { T0: 0, T1: 0, T2: 0 }
        for (const log of (todayLogs || []).filter((l: any) => l.account_id === account.id)) {
          const intensity = (log as any).templates?.intensity || 'T0'
          byIntensity[intensity] = (byIntensity[intensity] || 0) + 1
        }

        let bestTier: string | null = null
        let bestDeficit = -Infinity
        for (const tier of ['T0', 'T1', 'T2']) {
          const desired = Math.round((ratio as any)[tier] * target)
          const deficit = desired - (byIntensity[tier] || 0)
          if (deficit > bestDeficit) {
            bestDeficit = deficit
            bestTier = tier
          }
        }
        nextIntensity = bestTier
      }

      plan.push({
        account_id: account.id,
        display_name: account.display_name,
        daily_target: target,
        already_posted: posted,
        remaining,
        next_intensity: remaining > 0 ? nextIntensity : null,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        date: today,
        plan,
        total_remaining: plan.reduce((s, p) => s + p.remaining, 0),
      })
    }

    const jobsCreated: string[] = []
    for (const item of plan) {
      if (item.remaining <= 0) continue

      const { data: templates } = await supabase
        .from('templates')
        .select('id')
        .eq('intensity', item.next_intensity || 'T0')
        .is('used', null)
        .limit(item.remaining)

      if (!templates || templates.length === 0) continue

      for (const template of templates) {
        const { data: job, error: jobError } = await supabase
          .from('video_jobs')
          .insert({
            template_id: template.id,
            account_id: item.account_id,
            post_type: 'video',
            visual_type: 'A',
            effect_preset: 'random',
            status: 'pending',
            progress: 0,
            logs: [],
          })
          .select('id')
          .single()

        if (!jobError && job) {
          jobsCreated.push(job.id)
        }
      }
    }

    return NextResponse.json({
      dry_run: false,
      date: today,
      plan,
      jobs_created: jobsCreated.length,
      job_ids: jobsCreated,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
