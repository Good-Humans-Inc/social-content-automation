import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const persona = searchParams.get('persona')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    let query = supabase
      .from('accounts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (persona) {
      query = query.eq('persona', persona)
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

    const {
      id,
      display_name,
      env_id,
      cloud_phone_id,
      persona,
      preferred_fandoms,
      preferred_intensity,
      video_source,
      daily_post_target,
      intensity_ratio,
    } = body

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        id,
        display_name,
        env_id,
        cloud_phone_id,
        persona,
        preferred_fandoms: preferred_fandoms || [],
        preferred_intensity,
        video_source,
        daily_post_target: daily_post_target ?? 2,
        intensity_ratio: intensity_ratio ?? { T0: 0.5, T1: 0.3, T2: 0.2 },
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

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Account id is required' }, { status: 400 })
    }

    const allowedFields = [
      'display_name', 'persona', 'preferred_fandoms', 'preferred_intensity',
      'video_source', 'daily_post_target', 'intensity_ratio',
    ]
    const sanitized: Record<string, any> = {}
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        sanitized[key] = updates[key]
      }
    }

    const { data, error } = await supabase
      .from('accounts')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
