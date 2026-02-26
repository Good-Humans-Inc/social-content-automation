import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const dateParam = searchParams.get('date')

    const targetDate = dateParam || new Date().toISOString().split('T')[0]
    const startOfDay = `${targetDate}T00:00:00.000Z`
    const endOfDay = `${targetDate}T23:59:59.999Z`

    const [logsResult, accountsResult] = await Promise.all([
      supabase
        .from('logs')
        .select('*, accounts(id, display_name, persona), templates(id, intensity)')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false }),
      supabase
        .from('accounts')
        .select('id, display_name, persona, daily_post_target, intensity_ratio'),
    ])

    if (logsResult.error) {
      return NextResponse.json({ error: logsResult.error.message }, { status: 500 })
    }

    const logs = logsResult.data || []
    const accounts = accountsResult.data || []

    const totalPosts = logs.length
    const successCount = logs.filter((l: any) => l.status === 'success').length
    const failedCount = logs.filter((l: any) => l.status === 'failed').length

    const byAccount: Record<string, {
      name: string
      success: number
      failed: number
      total: number
      target: number
      byIntensity: Record<string, number>
    }> = {}

    for (const account of accounts) {
      byAccount[account.id] = {
        name: account.display_name,
        success: 0,
        failed: 0,
        total: 0,
        target: account.daily_post_target ?? 2,
        byIntensity: { T0: 0, T1: 0, T2: 0 },
      }
    }

    for (const log of logs) {
      const aid = log.account_id
      if (!byAccount[aid]) {
        byAccount[aid] = {
          name: log.accounts?.display_name || aid,
          success: 0,
          failed: 0,
          total: 0,
          target: 2,
          byIntensity: { T0: 0, T1: 0, T2: 0 },
        }
      }
      byAccount[aid].total++
      if (log.status === 'success') {
        byAccount[aid].success++
        const intensity = log.templates?.intensity || 'T0'
        byAccount[aid].byIntensity[intensity] = (byAccount[aid].byIntensity[intensity] || 0) + 1
      } else {
        byAccount[aid].failed++
      }
    }

    const intensityTotals: Record<string, number> = { T0: 0, T1: 0, T2: 0 }
    for (const log of logs) {
      if (log.status === 'success') {
        const intensity = log.templates?.intensity || 'T0'
        intensityTotals[intensity] = (intensityTotals[intensity] || 0) + 1
      }
    }

    const failReasons: Record<string, number> = {}
    for (const log of logs) {
      if (log.status === 'failed' && log.error_message) {
        const reason = log.error_message.length > 80
          ? log.error_message.substring(0, 80) + '...'
          : log.error_message
        failReasons[reason] = (failReasons[reason] || 0) + 1
      }
    }

    const topFailReasons = Object.entries(failReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }))

    return NextResponse.json({
      date: targetDate,
      totalPosts,
      successCount,
      failedCount,
      intensityTotals,
      byAccount,
      topFailReasons,
      recentLogs: logs.slice(0, 20),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
