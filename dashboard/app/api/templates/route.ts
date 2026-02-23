import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const persona = searchParams.get('persona')
    const fandom = searchParams.get('fandom')
    const intensity = searchParams.get('intensity')
    const unused = searchParams.get('unused') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    let query = supabase
      .from('templates')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (persona) {
      query = query.eq('persona', persona)
    }

    if (fandom) {
      query = query.eq('fandom', fandom)
    }

    if (intensity) {
      query = query.eq('intensity', intensity)
    }

    if (unused) {
      query = query.is('used', null)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { id, persona, fandom, intensity, overlay, caption, tags, carousel_type, grid_images } = body

    const insertData: any = {
      id,
      persona,
      fandom,
      intensity: intensity || 'T0',
      overlay: overlay || [],
      caption,
      tags: tags || [],
      used: null,
    }

    // Add optional carousel fields if provided
    if (carousel_type !== undefined) {
      insertData.carousel_type = carousel_type || null
    }
    if (grid_images !== undefined) {
      insertData.grid_images = grid_images || null
    }

    const { data, error } = await supabase
      .from('templates')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    // Remove null/undefined values
    const cleanUpdates: any = {}
    if (updates.persona !== undefined) cleanUpdates.persona = updates.persona
    if (updates.fandom !== undefined) cleanUpdates.fandom = updates.fandom
    if (updates.intensity !== undefined) cleanUpdates.intensity = updates.intensity
    if (updates.overlay !== undefined) cleanUpdates.overlay = updates.overlay
    if (updates.caption !== undefined) cleanUpdates.caption = updates.caption
    if (updates.tags !== undefined) cleanUpdates.tags = updates.tags
    if (updates.carousel_type !== undefined) cleanUpdates.carousel_type = updates.carousel_type || null
    if (updates.grid_images !== undefined) cleanUpdates.grid_images = updates.grid_images || null
    if (updates.used !== undefined) cleanUpdates.used = updates.used

    const { data, error } = await supabase
      .from('templates')
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
