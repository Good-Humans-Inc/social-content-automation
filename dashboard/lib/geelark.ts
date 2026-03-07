/**
 * GeeLark API Client for TypeScript/Next.js
 * Handles authentication, file uploads, and task creation
 */

export class GeeLarkError extends Error {
  constructor(message: string, public code?: number, public status?: number) {
    super(message)
    this.name = 'GeeLarkError'
  }
}

export class GeeLarkClient {
  private apiBase: string
  private apiKey: string
  private appId?: string
  /** Optional base URL for screenshot/openApp (e.g. https://api.geelark.com). Uses /v1/phone/... paths. */
  private screenshotApiBase?: string

  constructor(apiBase: string, apiKey: string, appId?: string, screenshotApiBase?: string) {
    this.apiBase = apiBase.replace(/\/$/, '')
    this.apiKey = apiKey
    this.appId = appId
    this.screenshotApiBase = screenshotApiBase?.replace(/\/$/, '')
  }

  private generateTraceId(): string {
    // Generate UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  private async generateSignature(traceId: string, ts: string, nonce: string): Promise<string> {
    const concat = `${this.appId}${traceId}${ts}${nonce}${this.apiKey}`
    
    // Use Web Crypto API for SHA256
    const encoder = new TextEncoder()
    const data = encoder.encode(concat)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return hashHex.toUpperCase()
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const traceId = this.generateTraceId()
    
    if (this.appId) {
      // Key verification mode (sign = SHA256(appId + traceId + ts + nonce + apiKey))
      const ts = Date.now().toString()
      const nonce = traceId.replace(/-/g, '').substring(0, 6)
      const sign = await this.generateSignature(traceId, ts, nonce)
      
      return {
        'Content-Type': 'application/json',
        'appId': this.appId,
        'traceId': traceId,
        'ts': ts,
        'nonce': nonce,
        'sign': sign,
      }
    } else {
      // Token verification mode (simpler)
      return {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'traceId': traceId,
      }
    }
  }

  async getUploadUrl(fileType: string): Promise<{ uploadUrl: string; resourceUrl: string; uploadHeaders?: Record<string, string> }> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/upload/getUrl`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileType }),
    })
    
    if (!response.ok) {
      throw new GeeLarkError(
        `Failed to get upload URL: ${response.statusText}`,
        undefined,
        response.status
      )
    }
    
    const data = await response.json()
    if (data.code !== 0) {
      throw new GeeLarkError(
        `GeeLark API error: ${data.msg || 'Unknown error'}`,
        data.code,
        response.status
      )
    }
    
    return data.data
  }

  /**
   * Alternative getUploadUrl that sends apiKey in the request body.
   * Use as fallback when Bearer/appId+sign both fail (e.g. backend expects key in body).
   */
  async getUploadUrlWithApiKeyInBody(fileType: string): Promise<{ uploadUrl: string; resourceUrl: string; uploadHeaders?: Record<string, string> }> {
    const traceId = this.generateTraceId()
    const response = await fetch(`${this.apiBase}/open/v1/upload/getUrl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'traceId': traceId,
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ fileType, apiKey: this.apiKey }),
    })
    if (!response.ok) {
      throw new GeeLarkError(`Failed to get upload URL: ${response.statusText}`, undefined, response.status)
    }
    const data = await response.json()
    if (data.code !== 0) {
      throw new GeeLarkError(`GeeLark API error: ${data.msg || 'Unknown error'}`, data.code, response.status)
    }
    return data.data
  }

  /**
   * Extract the timestamp (Unix seconds) that was used to sign the OSS presigned URL.
   * OSS StringToSign uses this value; we must send it as Date/x-oss-date when PUTting.
   */
  private parseSignedTimestampFromUrl(uploadUrl: string): number | null {
    try {
      const url = new URL(uploadUrl)
      const paramNames = ['Expires', 'expires', 'x-oss-expires', 'X-Oss-Expires', 't', 'timestamp', 'date']
      for (const name of paramNames) {
        const val = url.searchParams.get(name)
        if (val) {
          const n = parseInt(val, 10)
          if (n >= 1e9 && n <= 2e9) return n
        }
      }
      for (const [key, value] of url.searchParams) {
        if (key === 'OSSAccessKeyId' || key === 'Signature' || key === 'signature') continue
        const n = parseInt(value, 10)
        if (!Number.isNaN(n) && n >= 1e9 && n <= 2e9) return n
      }
    } catch {
      // no-op
    }
    const m = uploadUrl.match(/[?&](?:Expires|expires|x-oss-expires|t|timestamp)=(\d{9,10})/i)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n >= 1e9 && n <= 2e9) return n
    }
    const anyNum = uploadUrl.match(/[?&][^=]+=(\d{10})\b/)
    if (anyNum) {
      const n = parseInt(anyNum[1], 10)
      if (n >= 1e9 && n <= 2e9) return n
    }
    return null
  }

  /**
   * Upload file to OSS presigned URL. Alibaba OSS requires the request to match
   * the exact headers used when the URL was signed. We send only Content-Type
   * and the signed timestamp as Date/x-oss-date so the server's verification matches.
   */
  async uploadFile(
    uploadUrl: string,
    file: File | Blob,
    options?: { uploadHeaders?: Record<string, string>; omitContentType?: boolean }
  ): Promise<void> {
    const body = await file.arrayBuffer()
    const contentType = file instanceof File ? file.type : 'video/mp4'

    const headers: Record<string, string> = { ...(options?.uploadHeaders ?? {}) }
    if (!options?.omitContentType) {
      headers['Content-Type'] = contentType
    }

    // Do NOT send Date or x-oss-date: the presigned URL already has the
    // timestamp baked into the query string (Expires param). Sending extra
    // headers changes the CanonicalizedOSSHeaders and breaks the signature.

    let response = await fetch(uploadUrl, {
      method: 'PUT',
      body,
      headers: Object.keys(headers).length ? headers : undefined,
    })

    // If signature mismatch, retry without any headers (matches Python client behavior)
    if (response.status === 403) {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        body,
      })
    }
    
    if (!response.ok && response.status !== 201) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new GeeLarkError(
        `Upload failed: ${response.status} ${errorText}`,
        undefined,
        response.status
      )
    }
  }

  async addTask(
    taskData: {
      scheduleAt: number
      envId: string
      video: string
      videoDesc: string
      needShareLink?: boolean
      markAI?: boolean
    },
    planName?: string
  ): Promise<string[]> {
    const headers = await this.getHeaders()
    const body: any = {
      taskType: 1,
      list: [taskData],
    }
    
    if (planName) {
      body.planName = planName
    }
    
    const response = await fetch(`${this.apiBase}/open/v1/task/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    
    if (!response.ok) {
      throw new GeeLarkError(
        `Failed to create task: ${response.statusText}`,
        undefined,
        response.status
      )
    }
    
    const data = await response.json()
    if (data.code !== 0) {
      throw new GeeLarkError(
        `GeeLark API error: ${data.msg || 'Unknown error'}`,
        data.code,
        response.status
      )
    }
    
    return data.data?.taskIds || []
  }

  async addCarouselTask(
    taskData: {
      envId: string
      slides: string[]
      videoDesc: string
      duration: number
      action?: string | number
      scheduleAt?: number
      music?: string
      needShareLink?: boolean
      markAI?: boolean
    },
    planName?: string
  ): Promise<string[]> {
    const headers = await this.getHeaders()
    const body: any = {
      taskType: 2,
      list: [taskData],
    }
    
    if (planName) {
      body.planName = planName
    }
    
    const response = await fetch(`${this.apiBase}/open/v1/task/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    
    if (!response.ok) {
      throw new GeeLarkError(
        `Failed to create carousel task: ${response.statusText}`,
        undefined,
        response.status
      )
    }
    
    const data = await response.json()
    if (data.code !== 0) {
      throw new GeeLarkError(
        `GeeLark API error: ${data.msg || 'Unknown error'}`,
        data.code,
        response.status
      )
    }
    
    return data.data?.taskIds || []
  }

  private async _get(path: string): Promise<any> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}${path}`, {
      method: 'GET',
      headers,
    })
    
    if (!response.ok) {
      throw new GeeLarkError(
        `Failed to fetch: ${response.statusText}`,
        undefined,
        response.status
      )
    }
    
    const data = await response.json()
    if (data.code !== 0) {
      throw new GeeLarkError(
        `GeeLark API error: ${data.msg || 'Unknown error'}`,
        data.code,
        response.status
      )
    }
    
    return data.data || {}
  }

  async listPhones(options?: {
    page?: number
    pageSize?: number
    ids?: string[]
    serialName?: string
    remark?: string
    groupName?: string
    tags?: string[]
    chargeMode?: number
  }): Promise<any> {
    const payload: any = {
      page: Math.max(1, options?.page || 1),
      pageSize: Math.min(100, Math.max(1, options?.pageSize || 100)),
    }
    
    if (options?.ids) {
      payload.ids = options.ids.slice(0, 100)
    }
    if (options?.serialName) {
      payload.serialName = options.serialName
    }
    if (options?.remark) {
      payload.remark = options.remark
    }
    if (options?.groupName) {
      payload.groupName = options.groupName
    }
    if (options?.tags) {
      payload.tags = options.tags
    }
    if (options?.chargeMode !== undefined) {
      payload.chargeMode = options.chargeMode
    }
    
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/phone/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    
    if (!response.ok) {
      throw new GeeLarkError(
        `Failed to list phones: ${response.statusText}`,
        undefined,
        response.status
      )
    }
    
    const data = await response.json()
    if (data.code !== 0) {
      throw new GeeLarkError(
        `GeeLark API error: ${data.msg || 'Unknown error'}`,
        data.code,
        response.status
      )
    }
    
    return data.data || {}
  }

  async listEnvironments(): Promise<any> {
    // Try the standard endpoint first
    try {
      return await this._get('/api/env')
    } catch (error) {
      // If that fails, try the openapi endpoint
      try {
        return await this._get('/open/v1/env')
      } catch (e) {
        // If both fail, return empty object
        console.warn('Failed to fetch environments from GeeLark:', e)
        return {}
      }
    }
  }

  /**
   * Start cloud phones by ID. Uses GeeLark open API phone control.
   */
  async startPhones(phoneIds: string[]): Promise<{ success: boolean; message?: string; data?: any }> {
    if (!phoneIds?.length) {
      return { success: false, message: 'No phone IDs provided' }
    }
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/phone/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: phoneIds }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to start phones: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    return { success: true, data: data.data }
  }

  /**
   * Stop cloud phones by ID.
   */
  async stopPhones(phoneIds: string[]): Promise<{ success: boolean; message?: string; data?: any }> {
    if (!phoneIds?.length) {
      return { success: false, message: 'No phone IDs provided' }
    }
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/phone/stop`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: phoneIds }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to stop phones: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    return { success: true, data: data.data }
  }

  /**
   * Query task status by task IDs.
   */
  async queryTaskStatus(taskIds: string[]): Promise<{ tasks?: Array<{ taskId: string; status: number | string; [k: string]: any }> }> {
    if (!taskIds?.length) {
      return { tasks: [] }
    }
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/task/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ Ids: taskIds }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to query tasks: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    return { tasks: data.data?.list ?? data.data?.tasks ?? data.data ?? [] }
  }

  /**
   * Add warmup task (taskType 2). Per GeeLark docs: scheduleAt, envId, action, duration (minutes), optional keywords.
   * action: "search profile" | "search video" | "browse video"
   */
  async addWarmupTask(
    envIds: string[],
    options: {
      scheduleAt: number
      action: 'search profile' | 'search video' | 'browse video'
      duration: number
      keywords?: string[]
      planName?: string
      remark?: string
    }
  ): Promise<string[]> {
    if (!envIds?.length) {
      return []
    }
    const headers = await this.getHeaders()
    const list = envIds.map((envId) => {
      const item: Record<string, unknown> = {
        scheduleAt: options.scheduleAt,
        envId,
        action: options.action,
        duration: options.duration,
      }
      if (options.keywords?.length) item.keywords = options.keywords
      return item
    })

    const body: any = {
      taskType: 2, // Warmup per docs (1=video, 2=warmup, 3=image set)
      list,
    }
    if (options?.planName) body.planName = options.planName
    if (options?.remark) body.remark = options.remark

    const response = await fetch(`${this.apiBase}/open/v1/task/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to add warmup task: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    return data.data?.taskIds ?? data.data?.list?.map((t: any) => t.taskId) ?? []
  }

  /**
   * Get task detail (status, failDesc, logs, etc.). Supports log pagination via searchAfter.
   * POST /open/v1/task/detail
   */
  async getTaskDetail(
    taskId: string,
    searchAfter?: unknown
  ): Promise<{
    id: string
    planName?: string
    taskType?: number
    serialName?: string
    envId?: string
    scheduleAt?: number
    status?: number
    failCode?: number
    failDesc?: string
    cost?: number
    resultImages?: string[]
    logs?: string[]
    searchAfter?: unknown
    logContinue?: boolean
  }> {
    if (!taskId?.trim()) {
      throw new GeeLarkError('Task ID is required', undefined, 400)
    }
    const headers = await this.getHeaders()
    const body: { id: string; searchAfter?: unknown } = { id: taskId.trim() }
    if (searchAfter !== undefined) body.searchAfter = searchAfter

    const response = await fetch(`${this.apiBase}/open/v1/task/detail`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to get task detail: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    return (data.data || {}) as {
      id: string
      planName?: string
      taskType?: number
      serialName?: string
      envId?: string
      scheduleAt?: number
      status?: number
      failCode?: number
      failDesc?: string
      cost?: number
      resultImages?: string[]
      logs?: string[]
      searchAfter?: unknown
      logContinue?: boolean
    }
  }

  /**
   * Request a screenshot from the cloud phone (GeeLark screenShot API).
   * POST https://openapi.geelark.com/open/v1/phone/screenShot with body { id }.
   * Returns taskId; the image may be delivered via callback or available via task/detail.
   */
  async getPhoneScreenshot(phoneId: string): Promise<{ taskId: string }> {
    if (!phoneId?.trim()) {
      throw new GeeLarkError('id (cloud phone id) is required for screenShot', undefined, 400)
    }
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/phone/screenShot`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: phoneId.trim() }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to get screenshot: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    const taskId = data.data?.taskId
    if (!taskId) {
      throw new GeeLarkError('No taskId in screenShot response', data.code, response.status)
    }
    return { taskId }
  }

  /**
   * Get screenshot result. POST /open/v1/phone/screenShot/result with { taskId }.
   * status: 0 = acquisition failed, 1 = in progress, 2 = success, 3 = execution failed.
   * Result available within 30 minutes after requesting the screenshot.
   */
  async getScreenShotResult(taskId: string): Promise<{ status: number; downloadLink?: string }> {
    if (!taskId?.trim()) {
      throw new GeeLarkError('taskId is required for screenShot/result', undefined, 400)
    }
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/phone/screenShot/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ taskId: taskId.trim() }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to get screenshot result: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    const d = data.data || {}
    return {
      status: d.status ?? -1,
      downloadLink: d.downloadLink,
    }
  }

  /** TikTok package name on Android (GeeLark cloud phones). */
  static readonly TIKTOK_PACKAGE = 'com.zhiliaoapp.musically'

  /**
   * Get list of applications installed on the cloud phone.
   * POST /open/v1/app/list
   * installStatus: 0=Installing, 1=Installed, 2=Failed, 3=Uninstalling, 4=Uninstalled, 5=Uninstall Failed, others=Not Installed
   */
  async listInstalledApps(
    envId: string,
    page: number = 1,
    pageSize: number = 100
  ): Promise<{
    total: number
    page: number
    pageSize: number
    items: Array<{
      appIcon?: string
      appId?: string
      appName?: string
      appVersionId?: string
      installStatus: number
      installTime?: string
      packageName: string
      versionCode?: string
      versionName?: string
    }>
  }> {
    if (!envId?.trim()) {
      throw new GeeLarkError('envId is required for app/list', undefined, 400)
    }
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/app/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        envId: envId.trim(),
        page: Math.max(1, page),
        pageSize: Math.min(100, Math.max(1, pageSize)),
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to list apps: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    const d = data.data || {}
    return {
      total: d.total ?? 0,
      page: d.page ?? page,
      pageSize: d.pageSize ?? pageSize,
      items: Array.isArray(d.items) ? d.items : [],
    }
  }

  /**
   * Check if TikTok is installed on the cloud phone (installStatus === 1).
   * Uses listInstalledApps with pageSize 100; if not found in first page and total > 100, returns false.
   */
  async isTikTokInstalled(envId: string): Promise<boolean> {
    const { items } = await this.listInstalledApps(envId, 1, 100)
    return items.some(
      (app) =>
        app.packageName === GeeLarkClient.TIKTOK_PACKAGE && app.installStatus === 1
    )
  }

  /**
   * List RPA task flows (e.g. to get flowId for "view profile" flow).
   * POST /open/v1/task/flow/list
   */
  async listTaskFlows(page: number = 1, pageSize: number = 20): Promise<{
    total: number
    page: number
    pageSize: number
    items: Array<{ id: string; title?: string; desc?: string; params?: string[] }>
  }> {
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/task/flow/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page: Math.max(1, page), pageSize: Math.min(100, Math.max(1, pageSize)) }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to list task flows: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    const d = data.data || {}
    return {
      total: d.total ?? 0,
      page: d.page ?? page,
      pageSize: d.pageSize ?? pageSize,
      items: Array.isArray(d.items) ? d.items : [],
    }
  }

  /**
   * Create custom task – run an RPA task flow on a cloud phone.
   * Get flowId from Task flow query API first. Use for e.g. open TikTok + click "Profile", then take screenshot.
   * POST /open/v1/task/rpa/add – name (≤128 chars), remark (≤200), scheduleAt (required), id (cloud phone ID), flowId (required), paramMap (optional; file-type params use array values).
   */
  async addRpaTask(
    envId: string,
    flowId: string,
    options?: { name?: string; remark?: string; paramMap?: Record<string, unknown> }
  ): Promise<string> {
    if (!envId?.trim()) throw new GeeLarkError('envId is required for RPA task', undefined, 400)
    if (!flowId?.trim()) throw new GeeLarkError('flowId is required for RPA task', undefined, 400)
    const scheduleAt = Math.floor(Date.now() / 1000)
    const body: Record<string, unknown> = {
      scheduleAt,
      id: envId.trim(),
      flowId: flowId.trim(),
    }
    if (options?.name) body.name = options.name
    if (options?.remark) body.remark = options.remark
    if (options?.paramMap && Object.keys(options.paramMap).length > 0) body.paramMap = options.paramMap

    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/task/rpa/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to add RPA task: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
    const taskId = data.data?.taskId
    if (!taskId) throw new GeeLarkError('No taskId in RPA task response', data.code, response.status)
    return taskId
  }

  /**
   * Simulate a tap at (x, y) on the cloud phone screen.
   * POST /open/v1/phone/tap – not present in GeeLark OpenAPI (returns 404). Kept for use if they add it or you have a different base.
   * For profile screens use GeeLark's TikTok APIs (e.g. TikTok profile edit / TikTok login) when available via API.
   */
  async tap(envId: string, x: number, y: number): Promise<void> {
    if (!envId?.trim()) {
      throw new GeeLarkError('envId is required for tap', undefined, 400)
    }
    const headers = await this.getHeaders()
    const response = await fetch(`${this.apiBase}/open/v1/phone/tap`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: envId.trim(), x: Math.round(x), y: Math.round(y) }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to tap: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
  }

  /**
   * Start an app on the cloud phone. POST /open/v1/app/start with { id, packageName } (or envId; GeeLark may expect id for device).
   */
  async startApp(envId: string, packageName: string = GeeLarkClient.TIKTOK_PACKAGE): Promise<void> {
    if (!envId?.trim()) {
      throw new GeeLarkError('envId is required for app/start', undefined, 400)
    }
    const headers = await this.getHeaders()
    const body: Record<string, string> = { packageName: packageName.trim() }
    // Prefer id for device (matches phone/screenShot, task/rpa/add); some APIs expect envId
    body.id = envId.trim()
    body.envId = envId.trim()
    const response = await fetch(`${this.apiBase}/open/v1/app/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new GeeLarkError(
        data.msg || `Failed to start app: ${response.statusText}`,
        data.code,
        response.status
      )
    }
    if (data.code !== 0 && data.code !== undefined) {
      throw new GeeLarkError(
        data.msg || 'GeeLark API error',
        data.code,
        response.status
      )
    }
  }

  static inferFileType(urlOrPath: string): string {
    const ext = urlOrPath.split('.').pop()?.toLowerCase() || ''
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'mp4'
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'jpg'
    if (['mp3', 'aac'].includes(ext)) return 'mp3'
    return 'mp4' // default
  }
}
