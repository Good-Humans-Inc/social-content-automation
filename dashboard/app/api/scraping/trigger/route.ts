import { NextRequest, NextResponse } from 'next/server'

// Simple trigger endpoint for extension to poll
// Stores trigger data temporarily (in-memory, or could use Redis in production)

const triggers: Map<string, any> = new Map()

// CORS headers for extension access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { target_urls, source_type, search_terms, max_posts } = body

    // Create a simple trigger ID
    const triggerId = `trigger_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Store trigger data (expires after 30 seconds)
    triggers.set(triggerId, {
      target_urls: target_urls || [],
      source_type: source_type || 'pinterest',
      search_terms: search_terms || [],
      max_posts: max_posts || 50, // Default to 50 if not provided
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
    // API key is optional for local development
    // In production, you should require authentication
    const apiKey = request.headers.get('x-api-key')

    // Return the most recent trigger
    const triggersArray = Array.from(triggers.entries())
    if (triggersArray.length === 0) {
      return NextResponse.json({ data: null }, { headers: corsHeaders })
    }

    // Get most recent trigger
    const [triggerId, triggerData] = triggersArray.sort(
      (a, b) => b[1].created_at - a[1].created_at
    )[0]

    // Delete it so it's only consumed once
    triggers.delete(triggerId)

    return NextResponse.json({ data: triggerData }, { headers: corsHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
