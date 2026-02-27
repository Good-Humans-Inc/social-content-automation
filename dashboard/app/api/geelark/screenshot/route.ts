import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

const POLL_MS = 2_000
const POLL_MAX_WAIT_MS = 30_000

async function requestScreenshotAndPoll(
  client: GeeLarkClient,
  phoneId: string
): Promise<{ taskId: string; imageUrl?: string }> {
  const { taskId } = await client.getPhoneScreenshot(phoneId)
  const pollUntil = Date.now() + POLL_MAX_WAIT_MS
  while (Date.now() < pollUntil) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    try {
      const result = await client.getScreenShotResult(taskId)
      if (result.status === 2 && result.downloadLink) return { taskId, imageUrl: result.downloadLink }
      if (result.status === 0 || result.status === 3) break
    } catch {
      break
    }
  }
  return { taskId }
}

/**
 * GET /api/geelark/screenshot?envId=xxx or ?phoneId=xxx - Request screenshot (GeeLark screenShot API).
 * Returns { success, taskId, imageUrl? }. Image may come via callback if not in task detail.
 */
export async function GET(request: NextRequest) {
  try {
    const phoneId = request.nextUrl.searchParams.get('envId') ?? request.nextUrl.searchParams.get('phoneId')
    if (!phoneId?.trim()) {
      return NextResponse.json(
        { error: 'envId or phoneId query parameter is required' },
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
    const result = await requestScreenshotAndPoll(client, phoneId.trim())

    return NextResponse.json({
      success: true,
      taskId: result.taskId,
      imageUrl: result.imageUrl,
    })
  } catch (error: unknown) {
    console.error('Screenshot error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Failed to get screenshot',
        details:
          error instanceof GeeLarkError
            ? { code: (error as GeeLarkError).code, status: (error as GeeLarkError).status }
            : undefined,
      },
      { status: (error instanceof GeeLarkError && (error as GeeLarkError).status) || 500 }
    )
  }
}

/**
 * POST /api/geelark/screenshot - Body: { phoneId: string } or { envId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const phoneId = body.phoneId ?? body.envId ?? body.env_id
    if (!phoneId || typeof phoneId !== 'string' || !phoneId.trim()) {
      return NextResponse.json(
        { error: 'phoneId or envId is required in request body' },
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
    const result = await requestScreenshotAndPoll(client, phoneId.trim())

    return NextResponse.json({
      success: true,
      taskId: result.taskId,
      imageUrl: result.imageUrl,
    })
  } catch (error: unknown) {
    console.error('Screenshot error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Failed to get screenshot',
        details:
          error instanceof GeeLarkError
            ? { code: (error as GeeLarkError).code, status: (error as GeeLarkError).status }
            : undefined,
      },
      { status: (error instanceof GeeLarkError && (error as GeeLarkError).status) || 500 }
    )
  }
}
