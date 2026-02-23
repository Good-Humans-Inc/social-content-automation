import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Endpoint for Chrome extension to update job progress
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const apiKey = request.headers.get('x-api-key')

    // TODO: Validate API key
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    const { job_id, status, progress, total_items, error_log } = body

    if (!job_id) {
      return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
    }

    const updateData: any = {}
    if (status) updateData.status = status
    if (progress !== undefined) updateData.progress = progress
    if (total_items !== undefined) updateData.total_items = total_items
    if (error_log !== undefined) updateData.error_log = error_log

    const { data, error } = await supabase
      .from('scraping_jobs')
      .update(updateData)
      .eq('id', job_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
