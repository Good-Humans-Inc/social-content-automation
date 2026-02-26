import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.json({ success: true, data: detail })
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
    return NextResponse.json({ success: true, data: detail })
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
