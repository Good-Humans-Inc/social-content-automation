import { NextRequest, NextResponse } from 'next/server'
import { popFromTemplateQueue, clearTemplateQueue } from '@/lib/templateQueue'

const triggers: Map<string, any> = new Map()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { target_urls, source_type, search_terms, max_posts } = body

    const triggerId = `trigger_${Date.now()}_${Math.random().toString(36).substring(7)}`

    triggers.set(triggerId, {
      target_urls: target_urls || [],
      source_type: source_type || 'pinterest',
      search_terms: search_terms || [],
      max_posts: max_posts || 50,
      created_at: Date.now(),
    })

    // Clean up old triggers
    const now = Date.now()
    for (const [id, data] of triggers.entries()) {
      if (now - data.created_at > 30000) {
        triggers.delete(id)
      }
    }

    return NextResponse.json({ trigger_id: triggerId, success: true }, { headers: corsHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Regular triggers take priority (manual scraping)
    const triggersArray = Array.from(triggers.entries())
    if (triggersArray.length > 0) {
      const [triggerId, triggerData] = triggersArray.sort(
        (a, b) => b[1].created_at - a[1].created_at
      )[0]

      triggers.delete(triggerId)

      return NextResponse.json({ data: triggerData }, { headers: corsHeaders })
    }

    // Then check the template scraping queue
    const task = popFromTemplateQueue()
    if (task) {
      return NextResponse.json({
        data: {
          target_urls: task.target_urls,
          source_type: task.source_type,
          search_terms: task.search_terms,
          max_posts: task.max_posts,
          template_id: task.template_id,
        },
      }, { headers: corsHeaders })
    }

    return NextResponse.json({ data: null }, { headers: corsHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function DELETE() {
  clearTemplateQueue()
  triggers.clear()
  return NextResponse.json(
    { success: true, message: 'Queue and triggers cleared' },
    { headers: corsHeaders }
  )
}
