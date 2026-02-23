import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Initialize GeeLark client
    const geelarkApiBase = process.env.GEELARK_API_BASE || 'https://openapi.geelark.com'
    const geelarkApiKey = process.env.GEELARK_API_KEY
    const geelarkAppId = process.env.GEELARK_APP_ID

    if (!geelarkApiKey) {
      return NextResponse.json(
        { error: 'GeeLark API key not configured. Set GEELARK_API_KEY environment variable.' },
        { status: 500 }
      )
    }

    const client = new GeeLarkClient(geelarkApiBase, geelarkApiKey, geelarkAppId)

    // Fetch environments from GeeLark
    const result = await client.listEnvironments()

    // Handle different response formats
    const environments = Array.isArray(result) 
      ? result 
      : result.list || result.environments || result.envs || (result ? [result] : [])

    return NextResponse.json({
      success: true,
      data: environments,
    })
  } catch (error: any) {
    console.error('Error fetching GeeLark environments:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch environments from GeeLark',
        details: error instanceof GeeLarkError ? { code: error.code, status: error.status } : undefined,
      },
      { status: error.status || 500 }
    )
  }
}
