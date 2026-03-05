import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/templates/next-id?persona=anime_otome
 * Returns the next sequential numeric id for the given persona.
 * Template ids are in the form {persona}_##### (e.g. anime_otome_00061).
 * We find the max numeric part in the DB and return max + 1 (or 1 if none).
 */
export async function GET(request: NextRequest) {
  try {
    const persona = request.nextUrl.searchParams.get('persona')?.trim()
    if (!persona) {
      return NextResponse.json(
        { error: 'Query parameter "persona" is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: rows, error } = await supabase
      .from('templates')
      .select('id')
      .eq('persona', persona)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const prefix = `${persona}_`
    let maxNum = 0
    for (const row of rows || []) {
      const id = (row as { id: string }).id
      if (id.startsWith(prefix)) {
        const numPart = id.slice(prefix.length)
        const num = parseInt(numPart, 10)
        if (!Number.isNaN(num) && num > maxNum) {
          maxNum = num
        }
      }
    }

    const next_id = maxNum + 1
    return NextResponse.json({ next_id, persona })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
