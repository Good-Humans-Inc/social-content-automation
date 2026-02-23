import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Endpoint for Chrome extension to poll for pending jobs
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const apiKey = request.headers.get('x-api-key')

    // TODO: Validate API key
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    // Get pending or running jobs
    const { data, error } = await supabase
      .from('scraping_jobs')
      .select('*')
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: true })
      .limit(1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data?.[0] || null })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
