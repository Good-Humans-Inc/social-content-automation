import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Get all unique slugs from assets table
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Fetch all unique slugs
    const { data, error } = await supabase
      .from('assets')
      .select('slug')
      .not('slug', 'is', null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Extract unique slugs and sort them
    const slugs = Array.from(
      new Set(
        (data || [])
          .map((item: any) => item.slug)
          .filter((slug: string | null | undefined) => slug && slug.trim() !== '')
      )
    ).sort()

    return NextResponse.json({ slugs })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
