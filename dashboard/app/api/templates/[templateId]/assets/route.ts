import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params
    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: links, error: linksError } = await supabase
      .from('asset_templates')
      .select('asset_id')
      .eq('template_id', templateId)

    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 })
    }

    const assetIds = (links || []).map((r: { asset_id: string }) => r.asset_id)
    if (assetIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, url, storage_path, category, subcategory, metadata, created_at')
      .in('id', assetIds)
      .order('created_at', { ascending: true })

    if (assetsError) {
      return NextResponse.json({ error: assetsError.message }, { status: 500 })
    }

    return NextResponse.json({ data: assets || [] })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/** DELETE: Remove all assets from this template (clear all links). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params
    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('asset_templates')
      .delete()
      .eq('template_id', templateId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
