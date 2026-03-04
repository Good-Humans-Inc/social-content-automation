import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: fandoms, error: fandomsError } = await supabase
      .from('fandoms')
      .select('id, short_id, display_name, full_name, aliases')
      .order('display_name')

    if (fandomsError) {
      return NextResponse.json({ error: fandomsError.message }, { status: 500 })
    }

    const { data: characters, error: charsError } = await supabase
      .from('characters')
      .select('id, fandom_id, name, aliases')
      .order('name')

    if (charsError) {
      return NextResponse.json({ error: charsError.message }, { status: 500 })
    }

    // Build a lookup-friendly config grouped by fandom short_id
    const charsByFandom: Record<string, typeof characters> = {}
    for (const char of characters || []) {
      const fandom = (fandoms || []).find((f: any) => f.id === char.fandom_id)
      if (!fandom) continue
      const key = (fandom as any).short_id
      if (!charsByFandom[key]) charsByFandom[key] = []
      charsByFandom[key].push(char)
    }

    const config = (fandoms || []).map((f: any) => ({
      id: f.short_id,
      displayName: f.display_name,
      fullName: f.full_name,
      aliases: f.aliases || [],
      characters: (charsByFandom[f.short_id] || []).map((c: any) => c.name),
      characterAliases: Object.fromEntries(
        (charsByFandom[f.short_id] || []).map((c: any) => [c.name, c.aliases || []])
      ),
    }))

    return NextResponse.json({ config }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
