import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const taskIdsParam = request.nextUrl.searchParams.get('taskIds')
    const taskIds = taskIdsParam ? taskIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : []

    if (taskIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing taskIds query parameter (comma-separated)' },
        { status: 400 }
      )
    }

    const geelarkApiBase = process.env.GEELARK_API_BASE || 'https://openapi.geelark.com'
    const geelarkApiKey = process.env.GEELARK_API_KEY
    const geelarkAppId = process.env.GEELARK_APP_ID

    if (!geelarkApiKey) {
      return NextResponse.json(
        { error: 'GeeLark API key not configured.' },
        { status: 500 }
      )
    }

    const client = new GeeLarkClient(geelarkApiBase, geelarkApiKey, geelarkAppId)
    const result = await client.queryTaskStatus(taskIds)

    return NextResponse.json({
      success: true,
      tasks: result.tasks ?? [],
    })
  } catch (error: any) {
    console.error('Warmup status error:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to query task status',
        details: error instanceof GeeLarkError ? { code: error.code, status: error.status } : undefined,
      },
      { status: 500 }
    )
  }
}
