import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_BOOT_WAIT_MS = 30_000
const DEFAULT_APP_WAIT_MS = 5_000
const SCREENSHOT_POLL_MS = 2_000
const SCREENSHOT_POLL_MAX_WAIT_MS = 30_000
const RPA_POLL_MS = 3_000
const RPA_POLL_MAX_WAIT_MS = 120_000

/**
 * POST /api/geelark/check-login
 * Body: { phoneId: string, fullWorkflow?: boolean, bootWaitSeconds?: number, appWaitSeconds?: number, profileViewFlowId?: string }
 *
 * Full workflow (when fullWorkflow !== false):
 * 1. Start the cloud phone
 * 2. Wait for boot (default 30s, or bootWaitSeconds)
 * 3a. If profileViewFlowId (or GEELARK_PROFILE_VIEW_FLOW_ID) is set: run that RPA flow (e.g. Open TikTok + Click "Profile"), wait for it to finish, then take screenshot → profile screen.
 * 3b. Else: Open TikTok app, wait for app to load, then take screenshot → For You feed.
 * 4. Take screenshot and return imageUrl.
 *
 * To get profile screen: Create an RPA task flow in GeeLark with "Open App" (com.zhiliaoapp.musically) and "Click element" (selector text, value "Profile"). Get the flow id from Task flow query API or dashboard, then set GEELARK_PROFILE_VIEW_FLOW_ID or pass profileViewFlowId in the request.
 *
 * Returns { success, imageUrl?, taskId?, steps?: string[] }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const phoneId = body.phoneId ?? body.envId ?? body.env_id
    if (!phoneId || typeof phoneId !== 'string' || !phoneId.trim()) {
      return NextResponse.json(
        { error: 'phoneId (or envId) is required in request body' },
        { status: 400 }
      )
    }
    const fullWorkflow = body.fullWorkflow !== false
    const bootWaitMs = Math.min(120_000, Math.max(5_000, (body.bootWaitSeconds ?? 30) * 1000))
    const appWaitMs = Math.min(30_000, Math.max(1_000, (body.appWaitSeconds ?? 5) * 1000))
    const profileViewFlowId =
      typeof body.profileViewFlowId === 'string' && body.profileViewFlowId.trim()
        ? body.profileViewFlowId.trim()
        : (process.env.GEELARK_PROFILE_VIEW_FLOW_ID ?? '').trim()

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
    const steps: string[] = []

    if (fullWorkflow) {
      steps.push('Starting cloud phone...')
      await client.startPhones([phoneId.trim()])
      steps.push('Waiting for device to boot...')
      await new Promise((r) => setTimeout(r, bootWaitMs))

      if (profileViewFlowId) {
        try {
          steps.push('Running profile-view RPA flow (open TikTok, click Profile)...')
          const rpaTaskId = await client.addRpaTask(phoneId.trim(), profileViewFlowId, {
            name: 'check-login-profile-view',
            remark: 'Open TikTok and navigate to Profile for screenshot',
          })
          steps.push(`RPA task created: ${rpaTaskId}`)
          const rpaPollUntil = Date.now() + RPA_POLL_MAX_WAIT_MS
          while (Date.now() < rpaPollUntil) {
            await new Promise((r) => setTimeout(r, RPA_POLL_MS))
            const { tasks } = await client.queryTaskStatus([rpaTaskId])
            const t = tasks?.[0]
            const status = t?.status
            if (status === 2 || status === '2' || t?.status === 'success') {
              steps.push('RPA flow completed.')
              break
            }
            if (status === 3 || status === '3' || t?.status === 'failed') {
              steps.push('RPA flow failed; taking screenshot of current screen.')
              break
            }
          }
          await new Promise((r) => setTimeout(r, 2_000))
        } catch (rpaErr: unknown) {
          steps.push(`RPA flow skipped or failed: ${(rpaErr as Error).message}`)
        }
      } else {
        try {
          steps.push('Opening TikTok app...')
          await client.startApp(phoneId.trim())
          steps.push('Waiting for app to load...')
          await new Promise((r) => setTimeout(r, appWaitMs))
        } catch (openAppErr: unknown) {
          steps.push(`Open app skipped or failed: ${(openAppErr as Error).message}`)
        }
      }
    }

    steps.push('Taking screenshot...')
    const { taskId } = await client.getPhoneScreenshot(phoneId.trim())
    steps.push(`Screenshot task created: ${taskId}`)

    let imageUrl: string | undefined
    const pollUntil = Date.now() + SCREENSHOT_POLL_MAX_WAIT_MS
    while (Date.now() < pollUntil) {
      await new Promise((r) => setTimeout(r, SCREENSHOT_POLL_MS))
      try {
        const result = await client.getScreenShotResult(taskId)
        if (result.status === 2 && result.downloadLink) {
          imageUrl = result.downloadLink
          steps.push('Screenshot image ready.')
          break
        }
        if (result.status === 0 || result.status === 3) {
          steps.push('Screenshot task failed or execution failed.')
          break
        }
      } catch {
        break
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      imageUrl: imageUrl ?? undefined,
      steps,
    })
  } catch (error: unknown) {
    console.error('Check-login error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Check login failed',
        details:
          error instanceof GeeLarkError
            ? { code: (error as GeeLarkError).code, status: (error as GeeLarkError).status }
            : undefined,
      },
      { status: (error instanceof GeeLarkError && (error as GeeLarkError).status) || 500 }
    )
  }
}
