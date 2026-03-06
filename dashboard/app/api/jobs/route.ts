import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const accountId = searchParams.get('account_id')
    const templateId = searchParams.get('template_id')
    const dateFrom = searchParams.get('date_from') // YYYY-MM-DD
    const dateTo = searchParams.get('date_to') // YYYY-MM-DD
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    let query = supabase
      .from('video_jobs')
      .select(`
        *,
        templates(id, persona, fandom, intensity, caption),
        accounts(id, display_name, persona)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (accountId) {
      query = query.eq('account_id', accountId)
    }

    if (templateId) {
      query = query.eq('template_id', templateId)
    }

    if (dateFrom) {
      const startOfDay = `${dateFrom}T00:00:00.000Z`
      query = query.gte('created_at', startOfDay)
    }
    if (dateTo) {
      const endOfDay = `${dateTo}T23:59:59.999Z`
      query = query.lte('created_at', endOfDay)
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
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      template_id,
      account_id,
      post_type = 'video',
      image_asset_ids = [],
      video_source,
      image_duration = 3.0,
      rapid_mode = false,
      music_asset_id,
      music_url,
      character_name,
      carousel_id,
      carousel_layout,
      visual_type = 'A',
      effect_preset = 'none',
      output_as_slides = false,
    } = body

    // Validate required fields
    if (!template_id) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 })
    }
    if (!account_id) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('video_jobs')
      .insert({
        template_id,
        account_id,
        post_type,
        image_asset_ids: Array.isArray(image_asset_ids) ? image_asset_ids : [],
        video_source: video_source || null,
        image_duration,
        rapid_mode,
        music_asset_id: music_asset_id || null,
        music_url: music_url || null,
        character_name: character_name || null,
        carousel_id: carousel_id || null,
        carousel_layout: carousel_layout || null,
        visual_type: visual_type || 'A',
        effect_preset: effect_preset || 'none',
        output_as_slides: output_as_slides || false,
        status: 'pending',
        progress: 0,
        logs: [],
      })
      .select(`
        *,
        templates(id, persona, fandom, intensity, caption),
        accounts(id, display_name, persona)
      `)
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
