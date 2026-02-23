import { GeeLarkClient, GeeLarkError } from '@/lib/geelark'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '100')
    const serialName = searchParams.get('serialName') || undefined
    const remark = searchParams.get('remark') || undefined
    const groupName = searchParams.get('groupName') || undefined
    const chargeMode = searchParams.get('chargeMode') ? parseInt(searchParams.get('chargeMode')!) : undefined

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

    // Fetch phones from GeeLark
    const result = await client.listPhones({
      page,
      pageSize,
      serialName,
      remark,
      groupName,
      chargeMode,
    })

    // Handle different response formats from GeeLark API
    // GeeLark returns: { code: 0, data: [{ items: [...], total, page, pageSize }] }
    // client.listPhones() returns: data.data which is [{ items: [...], total, page, pageSize }]
    let phonesArray: any[] = []
    let paginationInfo: any = {}

    // Debug logging
    console.log('[GeeLark Phones API] Raw result:', JSON.stringify(result, null, 2))

    if (Array.isArray(result)) {
      // If result is directly an array, check if it's the nested structure
      if (result.length > 0 && result[0] && typeof result[0] === 'object' && 'items' in result[0] && Array.isArray(result[0].items)) {
        // Nested structure: [{ items: [...], total, page, pageSize }]
        phonesArray = result[0].items || []
        paginationInfo = {
          page: result[0].page || page,
          pageSize: result[0].pageSize || pageSize,
          total: result[0].total || phonesArray.length,
        }
        console.log('[GeeLark Phones API] Extracted phones from nested structure:', phonesArray.length)
      } else {
        // Direct array of phones
        phonesArray = result
        console.log('[GeeLark Phones API] Using direct array:', phonesArray.length)
      }
    } else if (result?.items && Array.isArray(result.items)) {
      // Single object with items array
      phonesArray = result.items
      paginationInfo = {
        page: result.page || page,
        pageSize: result.pageSize || pageSize,
        total: result.total || phonesArray.length,
      }
    } else if (Array.isArray(result?.data)) {
      // If result has a data array (nested structure)
      if (result.data.length > 0 && result.data[0]?.items && Array.isArray(result.data[0].items)) {
        phonesArray = result.data[0].items
        paginationInfo = {
          page: result.data[0].page || page,
          pageSize: result.data[0].pageSize || pageSize,
          total: result.data[0].total || phonesArray.length,
        }
      } else {
        phonesArray = result.data
      }
    } else if (result?.list && Array.isArray(result.list)) {
      phonesArray = result.list
    } else if (result?.phones && Array.isArray(result.phones)) {
      phonesArray = result.phones
    } else if (result && typeof result === 'object') {
      // If result is an object with phone-like properties, wrap it in an array
      phonesArray = [result]
    }

    console.log('[GeeLark Phones API] Final phones array length:', phonesArray.length)

    return NextResponse.json({
      success: true,
      data: phonesArray,
      pagination: {
        page: paginationInfo.page || result?.page || page,
        pageSize: paginationInfo.pageSize || result?.pageSize || pageSize,
        total: paginationInfo.total || result?.total || result?.count || phonesArray.length,
        totalPages: Math.ceil((paginationInfo.total || result?.total || result?.count || phonesArray.length) / (paginationInfo.pageSize || result?.pageSize || pageSize)),
      },
    })
  } catch (error: any) {
    console.error('Error fetching GeeLark phones:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch phones from GeeLark',
        details: error instanceof GeeLarkError ? { code: error.code, status: error.status } : undefined,
      },
      { status: error.status || 500 }
    )
  }
}
