import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const fandom = searchParams.get('fandom')
    const category = searchParams.get('category')
    const subcategory = searchParams.get('subcategory')
    const tag = searchParams.get('tag')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    let query = supabase
      .from('assets')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (fandom) {
      query = query.eq('fandom', fandom)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (subcategory) {
      query = query.eq('subcategory', subcategory)
    }

    if (tag) {
      query = query.contains('tags', [tag])
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

    const { url, storage_path, fandom, tags, metadata } = body

    const { data, error } = await supabase
      .from('assets')
      .insert({
        url,
        storage_path,
        fandom,
        tags: tags || [],
        metadata: metadata || {},
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
