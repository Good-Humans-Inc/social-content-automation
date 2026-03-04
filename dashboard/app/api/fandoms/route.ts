import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: fandoms, error } = await supabase
      .from('fandoms')
      .select(`
        *,
        characters (*)
      `)
      .order('display_name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sort characters within each fandom
    const sorted = (fandoms || []).map((f: any) => ({
      ...f,
      characters: (f.characters || []).sort((a: any, b: any) =>
        a.name.localeCompare(b.name)
      ),
    }))

    return NextResponse.json({ fandoms: sorted })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { short_id, display_name, full_name, aliases } = body

    if (!short_id || !display_name || !full_name) {
      return NextResponse.json(
        { error: 'short_id, display_name, and full_name are required' },
        { status: 400 }
      )
    }

    const sanitizedShortId = short_id.toLowerCase().replace(/[^a-z0-9_]/g, '_')

    const { data, error } = await supabase
      .from('fandoms')
      .insert({
        short_id: sanitizedShortId,
        display_name,
        full_name: full_name.toLowerCase(),
        aliases: aliases || [sanitizedShortId, full_name.toLowerCase()],
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Fandom with short_id "${sanitizedShortId}" already exists` },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ fandom: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { id, short_id, display_name, full_name, aliases } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (short_id) updates.short_id = short_id.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (display_name) updates.display_name = display_name
    if (full_name) updates.full_name = full_name.toLowerCase()
    if (aliases) updates.aliases = aliases

    const { data, error } = await supabase
      .from('fandoms')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ fandom: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase.from('fandoms').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
