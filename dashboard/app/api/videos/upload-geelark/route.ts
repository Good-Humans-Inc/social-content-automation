import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      video_url,
      account_id,
      template_id,
      caption,
      schedule_minutes = 120,
      plan_name = 'auto-plan',
    } = body

    if (!video_url || !account_id) {
      return NextResponse.json(
        { error: 'Missing required fields: video_url and account_id' },
        { status: 400 }
      )
    }

    // Get account info
    const supabase = await createClient()
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    // Get template info if provided
    let templateCaption = caption
    if (template_id && !caption) {
      const { data: template } = await supabase
        .from('templates')
        .select('caption, tags')
        .eq('id', template_id)
        .single()

      if (template) {
        // Build caption from template
        const tags = (template.tags || []).join(' ')
        templateCaption = `${template.caption} ${tags}`.trim()
      }
    }

    // Initialize GeeLark client. Only GEELARK_API_KEY is required (Bearer token).
    // GEELARK_APP_ID is optional (for key-verification mode); if unset, token-only auth is used.
    const geelarkApiBase = process.env.GEELARK_API_BASE || 'https://openapi.geelark.com'
    const geelarkApiKey = process.env.GEELARK_API_KEY
    const geelarkAppId = process.env.GEELARK_APP_ID?.trim() || undefined

    if (!geelarkApiKey) {
      return NextResponse.json(
        { error: 'GeeLark API key not configured. Set GEELARK_API_KEY environment variable.' },
        { status: 500 }
      )
    }

    let client = new GeeLarkClient(geelarkApiBase, geelarkApiKey, geelarkAppId)

    // Download video from Supabase Storage or URL
    let videoBlob: Blob
    try {
      const videoResponse = await fetch(video_url)
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`)
      }
      videoBlob = await videoResponse.blob()
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to download video: ${error.message}` },
        { status: 500 }
      )
    }

    const fileType = GeeLarkClient.inferFileType(video_url)

    // Get upload URL: try token, then key verification, then apiKey-in-body, then alternate base URL.
    let uploadUrl: string = ''
    let resourceUrl: string = ''
    let uploadHeaders: Record<string, string> | undefined
    const bases = [geelarkApiBase, 'https://open.geelark.com']
    let lastError: string = ''
    let got = false
    let winningBase = geelarkApiBase
    let winningAppId: string | undefined = undefined
    const methods: Array<{ name: string; fn: (b: string) => Promise<{ uploadUrl: string; resourceUrl: string; uploadHeaders?: Record<string, string> }> }> = [
      { name: 'token', fn: (b) => new GeeLarkClient(b, geelarkApiKey, undefined).getUploadUrl(fileType) },
      { name: 'key', fn: (b) => geelarkAppId ? new GeeLarkClient(b, geelarkApiKey, geelarkAppId).getUploadUrl(fileType) : Promise.reject(new Error('No appId')) },
      { name: 'apiKeyInBody', fn: (b) => new GeeLarkClient(b, geelarkApiKey, undefined).getUploadUrlWithApiKeyInBody(fileType) },
    ]
    for (const base of bases) {
      for (const { name, fn } of methods) {
        try {
          const urls = await fn(base)
          uploadUrl = urls.uploadUrl
          resourceUrl = urls.resourceUrl
          uploadHeaders = urls.uploadHeaders
          winningBase = base
          winningAppId = name === 'key' ? geelarkAppId : undefined
          got = true
          break
        } catch (e: any) {
          lastError = e?.message ?? String(e)
        }
      }
      if (got) break
    }
    if (!got) {
      return NextResponse.json(
        { error: `Failed to get GeeLark upload URL. All auth methods failed. Last error: ${lastError}. Check GEELARK_API_KEY and GEELARK_APP_ID in dashboard .env; confirm the key at open.geelark.com or with GeeLark support.` },
        { status: 500 }
      )
    }
    client = new GeeLarkClient(winningBase, geelarkApiKey, winningAppId)

    // Upload video to OSS presigned URL (signature must match request headers/body)
    try {
      await client.uploadFile(uploadUrl, videoBlob, { uploadHeaders })
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to upload video to GeeLark: ${error.message}` },
        { status: 500 }
      )
    }

    // Calculate schedule time (minutes from now)
    const scheduleAt = Math.floor(Date.now() / 1000) + schedule_minutes * 60

    // Create GeeLark task
    let taskIds: string[]
    try {
      taskIds = await client.addTask(
        {
          scheduleAt,
          envId: account.env_id,
          video: resourceUrl,
          videoDesc: templateCaption || '',
          needShareLink: false,
          markAI: false,
        },
        plan_name
      )
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to create GeeLark task: ${error.message}` },
        { status: 500 }
      )
    }

    // Log to database as pending — actual success/failure is updated when GeeLark task completes (or when user views task detail).
    const adminSupabase = createAdminClient()
    const { error: logError } = await adminSupabase.from('logs').insert({
      type: 'video',
      account_id: account_id,
      status: 'pending',
      scheduled_time: new Date(scheduleAt * 1000).toISOString(),
      video_url: video_url,
      resource_url: resourceUrl,
      task_id: taskIds[0] || null,
      template_id: template_id || null,
    })

    if (logError) {
      console.error('Failed to log to database:', logError)
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      taskId: taskIds[0],
      resourceUrl,
      scheduledAt: scheduleAt,
      scheduledTime: new Date(scheduleAt * 1000).toISOString(),
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    )
  }
}
