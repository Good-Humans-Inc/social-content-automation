import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const intensity = request.nextUrl.searchParams.get('intensity')?.trim() || null

    let query = supabase
      .from('templates')
      .select('fandom')
      .not('fandom', 'is', null)

    if (intensity) {
      query = query.eq('intensity', intensity)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const fandoms = [...new Set((data || []).map((r) => r.fandom).filter(Boolean))].sort()
    return NextResponse.json({ fandoms })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
