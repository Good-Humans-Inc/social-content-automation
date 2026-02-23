import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const persona = searchParams.get('persona')
    const unused = searchParams.get('unused') !== 'false' // default to true

    let query = supabase.from('templates').select('*').order('id', { ascending: true })

    if (persona) {
      query = query.eq('persona', persona)
    }

    if (unused) {
      query = query.is('used', null)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Convert to JSONL format
    const jsonl = (data || [])
      .map((template) => {
        return JSON.stringify({
          id: template.id,
          persona: template.persona,
          fandom: template.fandom,
          intensity: template.intensity,
          overlay: template.overlay,
          caption: template.caption,
          tags: template.tags,
          used: template.used,
        })
      })
      .join('\n')

    return new NextResponse(jsonl, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="templates.jsonl"',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
