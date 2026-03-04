import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// GeeLark task status: 1=Waiting, 2=In progress, 3=Completed, 4=Failed, 7=Cancelled
const GEELARK_STATUS_COMPLETED = 3
const GEELARK_STATUS_FAILED = 4
const GEELARK_STATUS_CANCELLED = 7

async function fetchTaskDetail(taskId: string, searchAfter?: unknown) {
  const geelarkApiBase = process.env.GEELARK_API_BASE || 'https://openapi.geelark.com'
  const geelarkApiKey = process.env.GEELARK_API_KEY
  const geelarkAppId = process.env.GEELARK_APP_ID
  if (!geelarkApiKey) {
    throw new Error('GeeLark API key not configured.')
  }
  const client = new GeeLarkClient(geelarkApiBase, geelarkApiKey, geelarkAppId)
  return client.getTaskDetail(taskId, searchAfter)
}

/** Sync our log row to match GeeLark task outcome so Logs and Daily Summary show correct success/failed. */
async function syncLogStatusFromTask(
  taskId: string,
  geelarkStatus: number | undefined,
  failDesc: string | undefined
): Promise<{ id: string; status: string; error_message: string | null } | null> {
  const status = geelarkStatus
  if (status === undefined || status === null) return null
  const isTerminal = [GEELARK_STATUS_COMPLETED, GEELARK_STATUS_FAILED, GEELARK_STATUS_CANCELLED].includes(status)
  if (!isTerminal) return null

  const supabase = createAdminClient()
  const { data: logs } = await supabase
    .from('logs')
    .select('id, status')
    .eq('task_id', taskId)
    .limit(1)

  const log = logs?.[0]
  if (!log) return null

  const newStatus = status === GEELARK_STATUS_COMPLETED ? 'success' : 'failed'
  const errorMessage = status === GEELARK_STATUS_COMPLETED ? null : (failDesc || 'Task failed')

  await supabase
    .from('logs')
    .update({ status: newStatus, error_message: errorMessage })
    .eq('id', log.id)

  return { id: log.id, status: newStatus, error_message: errorMessage }
}

/**
 * GET /api/geelark/task/[id] - Fetch GeeLark task detail.
 * Query: searchAfter - optional JSON string for log pagination.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }
    const searchAfterParam = request.nextUrl.searchParams.get('searchAfter')
    let searchAfter: unknown
    if (searchAfterParam) {
      try {
        searchAfter = JSON.parse(searchAfterParam) as unknown
      } catch {
        return NextResponse.json(
          { error: 'searchAfter must be valid JSON' },
          { status: 400 }
        )
      }
    }
    const detail = await fetchTaskDetail(taskId, searchAfter)
    const updatedLog = await syncLogStatusFromTask(
      taskId,
      detail.status,
      detail.failDesc
    )
    return NextResponse.json({ success: true, data: detail, updatedLog: updatedLog ?? undefined })
  } catch (error: unknown) {
    console.error('Task detail error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Failed to get task detail',
        details:
          error instanceof GeeLarkError
            ? { code: error.code, status: error.status }
            : undefined,
      },
      { status: (error instanceof GeeLarkError && error.status) || 500 }
    )
  }
}

/**
 * POST /api/geelark/task/[id] - Fetch task detail with optional searchAfter in body (for log pagination).
 * Body: { searchAfter?: unknown }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const searchAfter = body.searchAfter
    const detail = await fetchTaskDetail(taskId, searchAfter)
    const updatedLog = await syncLogStatusFromTask(
      taskId,
      detail.status,
      detail.failDesc
    )
    return NextResponse.json({ success: true, data: detail, updatedLog: updatedLog ?? undefined })
  } catch (error: unknown) {
    console.error('Task detail error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Failed to get task detail',
        details:
          error instanceof GeeLarkError
            ? { code: error.code, status: error.status }
            : undefined,
      },
      { status: (error instanceof GeeLarkError && error.status) || 500 }
    )
  }
}
