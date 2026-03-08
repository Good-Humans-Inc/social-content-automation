import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GeeLark task status: 1=Waiting, 2=In progress, 3=Completed, 4=Failed, 7=Cancelled
const GEELARK_STATUS_COMPLETED = 3
const GEELARK_STATUS_FAILED = 4
const GEELARK_STATUS_CANCELLED = 7
const TERMINAL_STATUSES = [GEELARK_STATUS_COMPLETED, GEELARK_STATUS_FAILED, GEELARK_STATUS_CANCELLED]

/**
 * POST /api/logs/sync-status
 * Fetches pending logs with task_id, queries GeeLark for their current status,
 * and updates the DB so "Refresh logs" shows up-to-date tags without opening each GeeLark detail.
 */
export async function POST() {
  try {
    const supabase = createAdminClient()
    const { data: pendingLogs } = await supabase
      .from('logs')
      .select('id, task_id')
      .eq('status', 'pending')
      .not('task_id', 'is', null)
      .limit(100)

    if (!pendingLogs?.length) {
      return NextResponse.json({ synced: 0 })
    }

    const taskIds = [...new Set(pendingLogs.map((l) => l.task_id).filter(Boolean))] as string[]
    if (taskIds.length === 0) {
      return NextResponse.json({ synced: 0 })
    }

    const geelarkApiBase = process.env.GEELARK_API_BASE || 'https://openapi.geelark.com'
    const geelarkApiKey = process.env.GEELARK_API_KEY
    const geelarkAppId = process.env.GEELARK_APP_ID
    if (!geelarkApiKey) {
      return NextResponse.json({ error: 'GeeLark API key not configured.' }, { status: 500 })
    }

    const client = new GeeLarkClient(geelarkApiBase, geelarkApiKey, geelarkAppId)
    const { tasks } = await client.queryTaskStatus(taskIds)
    const taskList = tasks ?? []

    const logByTaskId = new Map<string | null, { id: string }>()
    for (const log of pendingLogs) {
      if (log.task_id) logByTaskId.set(log.task_id, { id: log.id })
    }

    let synced = 0
    for (const t of taskList) {
      const taskId = (t.taskId ?? (t as { id?: string }).id) ?? null
      if (!taskId) continue
      const rawStatus = t.status
      const status = typeof rawStatus === 'string' ? parseInt(rawStatus, 10) : rawStatus
      if (status === undefined || status === null || !TERMINAL_STATUSES.includes(status)) continue

      const log = logByTaskId.get(taskId)
      if (!log) continue

      const newStatus = status === GEELARK_STATUS_COMPLETED ? 'success' : 'failed'
      const errorMessage = status === GEELARK_STATUS_COMPLETED ? null : (t.failDesc ?? 'Task failed')

      await supabase
        .from('logs')
        .update({ status: newStatus, error_message: errorMessage })
        .eq('id', log.id)
      synced++
    }

    return NextResponse.json({ synced })
  } catch (error: unknown) {
    console.error('Logs sync-status error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Sync failed',
        details:
          error instanceof GeeLarkError
            ? { code: (error as GeeLarkError).code, status: (error as GeeLarkError).status }
            : undefined,
      },
      { status: (error instanceof GeeLarkError && (error as GeeLarkError).status) || 500 }
    )
  }
}
