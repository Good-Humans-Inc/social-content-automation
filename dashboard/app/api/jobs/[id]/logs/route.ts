import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    const { level = 'info', message } = body

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Get current job to append to logs
    const { data: job, error: fetchError } = await supabase
      .from('video_jobs')
      .select('logs')
      .eq('id', id)
      .single()

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Append new log entry
    const logs = Array.isArray(job.logs) ? job.logs : []
    const newLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
    }
    logs.push(newLog)

    // Update job with new logs
    const { data, error } = await supabase
      .from('video_jobs')
      .update({ logs })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: newLog })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
