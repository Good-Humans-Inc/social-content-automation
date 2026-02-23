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

  constructor(apiBase: string, apiKey: string, appId?: string) {
    this.apiBase = apiBase.replace(/\/$/, '')
    this.apiKey = apiKey
    this.appId = appId
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

  static inferFileType(urlOrPath: string): string {
    const ext = urlOrPath.split('.').pop()?.toLowerCase() || ''
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'mp4'
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'jpg'
    if (['mp3', 'aac'].includes(ext)) return 'mp3'
    return 'mp4' // default
  }
}
