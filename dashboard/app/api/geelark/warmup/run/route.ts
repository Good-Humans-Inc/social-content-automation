import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

const POLL_INTERVAL_MS = 10_000
const MAX_WAIT_MS = 5 * 60 * 1000 // 5 minutes total
const TASK_STATUS_DONE = [2, 3, '2', '3', 'completed', 'success', 'done']
const TASK_STATUS_FAILED = [4, 5, '4', '5', 'failed', 'error']

export type WarmupResultStatus = 'success' | 'failed' | 'skipped'

export interface WarmupProfileLog {
  accountId: string
  displayName: string
  envId: string
  cloudPhoneId: string
  status: WarmupResultStatus
  message?: string
  taskId?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      accountIds,
      phoneIds: rawPhoneIds,
      planName,
      remark,
      action,
      keywords,
      durationMinutes,
      duration,
    } = body
    const durationMins = durationMinutes ?? (typeof duration === 'number' ? duration : parseInt(String(duration || '10'), 10) || 10)
    const warmupAction = action === 'search profile' || action === 'search video' || action === 'browse video'
      ? action
      : 'browse video'

    let profiles: Array<{ accountId: string; displayName: string; envId: string; cloudPhoneId: string }> = []

    if (accountIds && Array.isArray(accountIds) && accountIds.length > 0) {
      const supabase = await createClient()
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('id, display_name, env_id, cloud_phone_id')
        .in('id', accountIds)

      if (error) {
        return NextResponse.json(
          { error: `Failed to fetch accounts: ${error.message}` },
          { status: 500 }
        )
      }
      if (!accounts?.length) {
        return NextResponse.json(
          { error: 'No accounts found for the given IDs' },
          { status: 400 }
        )
      }
      profiles = accounts.map((a) => ({
        accountId: a.id,
        displayName: a.display_name ?? a.id,
        envId: a.env_id,
        cloudPhoneId: a.cloud_phone_id,
      }))
    } else if (rawPhoneIds && Array.isArray(rawPhoneIds) && rawPhoneIds.length > 0) {
      profiles = rawPhoneIds.map((id: string) => ({
        accountId: id,
        displayName: `Phone ${id}`,
        envId: id,
        cloudPhoneId: id,
      }))
    } else {
      return NextResponse.json(
        { error: 'Provide accountIds or phoneIds in the request body' },
        { status: 400 }
      )
    }

    const geelarkApiBase = process.env.GEELARK_API_BASE || 'https://openapi.geelark.com'
    const geelarkApiKey = process.env.GEELARK_API_KEY
    const geelarkAppId = process.env.GEELARK_APP_ID

    if (!geelarkApiKey) {
      return NextResponse.json(
        { error: 'GeeLark API key not configured. Set GEELARK_API_KEY environment variable.' },
        { status: 500 }
      )
    }

    const client = new GeeLarkClient(geelarkApiBase, geelarkApiKey, geelarkAppId)
    const logs: WarmupProfileLog[] = []
    const phoneIds = profiles.map((p) => p.cloudPhoneId)
    const envIds = profiles.map((p) => p.envId)

    // 1. Start cloud phones
    for (const p of profiles) {
      try {
        await client.startPhones([p.cloudPhoneId])
        logs.push({
          accountId: p.accountId,
          displayName: p.displayName,
          envId: p.envId,
          cloudPhoneId: p.cloudPhoneId,
          status: 'success',
          message: 'Phone started',
        })
      } catch (err: any) {
        logs.push({
          accountId: p.accountId,
          displayName: p.displayName,
          envId: p.envId,
          cloudPhoneId: p.cloudPhoneId,
          status: 'failed',
          message: err.message || 'Failed to start phone',
        })
      }
    }

    const started = logs.filter((l) => l.status === 'success' && l.message === 'Phone started')
    if (started.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No phones could be started',
        logs,
      })
    }

    // Small delay so devices are ready before starting warmup
    await new Promise((r) => setTimeout(r, 3000))

    // 2. Trigger warmup tasks (taskType 2: scheduleAt, envId, action, duration in minutes)
    const scheduleAt = Math.floor(Date.now() / 1000)
    let taskIds: string[] = []
    const envIdsStarted = started.map((l) => l.envId)
    try {
      taskIds = await client.addWarmupTask(envIdsStarted, {
        scheduleAt,
        action: warmupAction,
        duration: durationMins,
        keywords: Array.isArray(keywords) && keywords.length > 0 ? keywords : undefined,
        planName: planName || 'warmup-plan',
        remark: remark || undefined,
      })
    } catch (err: any) {
      for (const p of started) {
        const log = logs.find((l) => l.envId === p.envId)
        if (log) {
          log.status = 'failed'
          log.message = (log.message || '') + `; Warmup trigger failed: ${err.message}`
        }
      }
      // Still try to stop phones
      try {
        await client.stopPhones(phoneIds)
      } catch {
        // ignore
      }
      return NextResponse.json({
        success: false,
        message: `Warmup trigger failed: ${err.message}`,
        logs,
      })
    }

    // Map taskId to profile (assume same order as envIdsStarted)
    const taskIdByEnvId: Record<string, string> = {}
    envIdsStarted.forEach((envId, i) => {
      if (taskIds[i]) taskIdByEnvId[envId] = taskIds[i]
    })
    logs.forEach((l) => {
      if (taskIdByEnvId[l.envId]) l.taskId = taskIdByEnvId[l.envId]
    })

    // 3. Poll task status until done or timeout
    const startTime = Date.now()
    while (Date.now() - startTime < MAX_WAIT_MS && taskIds.length > 0) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      try {
        const { tasks } = await client.queryTaskStatus(taskIds)
        if (!tasks?.length) continue
        const allDone = tasks.every((t) => {
          const s = t.status
          return TASK_STATUS_DONE.includes(s as never) || TASK_STATUS_FAILED.includes(s as never)
        })
        if (allDone) {
          for (const t of tasks) {
            const status = TASK_STATUS_FAILED.includes(t.status as never) ? 'failed' : 'success'
            const taskId = t.taskId ?? t.id ?? t.task_id
            const log = logs.find((l) => l.taskId === taskId)
            if (log) {
              log.status = status
              log.message = status === 'success' ? 'Warmup completed' : `Task status: ${t.status}`
            }
          }
          break
        }
      } catch (err) {
        // Poll error: continue waiting or break
        if (Date.now() - startTime > MAX_WAIT_MS * 0.8) break
      }
    }

    // Mark any still-running as skipped or timeout
    logs.forEach((l) => {
      if (l.status === 'success' && l.message === 'Phone started') {
        l.status = 'skipped'
        l.message = 'Warmup task started; status check timed out or unavailable'
      }
    })

    // 4. Stop phones
    try {
      await client.stopPhones(phoneIds)
    } catch (err: any) {
      logs.forEach((l) => {
        if (l.message && !l.message.includes('stop')) {
          l.message = l.message + `; Stop phone error: ${err.message}`
        }
      })
    }

    const successCount = logs.filter((l) => l.status === 'success').length
    const failedCount = logs.filter((l) => l.status === 'failed').length
    const skippedCount = logs.filter((l) => l.status === 'skipped').length

    const adminSupabase = createAdminClient()
    const scheduleAtDate = new Date(scheduleAt * 1000).toISOString()
    for (const l of logs) {
      await adminSupabase.from('logs').insert({
        type: 'warmup',
        account_id: l.accountId,
        status: l.status,
        error_message: l.message ?? null,
        scheduled_time: scheduleAtDate,
        task_id: l.taskId ?? null,
        display_name: l.displayName,
        env_id: l.envId,
        cloud_phone_id: l.cloudPhoneId,
        plan_name: planName || 'warmup-plan',
        action: warmupAction,
        duration_minutes: durationMins,
      })
    }

    return NextResponse.json({
      success: failedCount === 0,
      message: `Warmup finished: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`,
      logs,
      summary: { success: successCount, failed: failedCount, skipped: skippedCount },
    })
  } catch (error: any) {
    console.error('Warmup run error:', error)
    return NextResponse.json(
      {
        error: error.message || 'Warmup run failed',
        details: error instanceof GeeLarkError ? { code: error.code, status: error.status } : undefined,
      },
      { status: 500 }
    )
  }
}
