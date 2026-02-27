import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/geelark/task-flows?page=1&pageSize=20
 * Lists RPA task flows. Use the flow id (e.g. for "Open TikTok + Click Profile") as GEELARK_PROFILE_VIEW_FLOW_ID or profileViewFlowId in check-login.
 */
export async function GET(request: NextRequest) {
  try {
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize')) || 20))

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
    const result = await client.listTaskFlows(page, pageSize)

    return NextResponse.json({
      success: true,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      items: result.items,
    })
  } catch (error: unknown) {
    console.error('Task flows error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Failed to list task flows',
        details:
          error instanceof GeeLarkError
            ? { code: (error as GeeLarkError).code, status: (error as GeeLarkError).status }
            : undefined,
      },
      { status: (error instanceof GeeLarkError && (error as GeeLarkError).status) || 500 }
    )
  }
}
