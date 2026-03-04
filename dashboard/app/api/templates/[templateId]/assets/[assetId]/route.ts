import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * DELETE: Remove the link between this template and this asset (unlink one image from the template).
 * The asset remains in the assets table; only the asset_templates row is deleted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string; assetId: string }> }
) {
  try {
    const { templateId, assetId } = await params
    if (!templateId || !assetId) {
      return NextResponse.json(
        { error: 'Template ID and Asset ID are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('asset_templates')
      .delete()
      .eq('template_id', templateId)
      .eq('asset_id', assetId)

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
