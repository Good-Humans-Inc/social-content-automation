import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Get all unique subcategories (characters) for a given category (anime)
 * This endpoint fetches ALL subcategories, not limited by pagination
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')

    if (!category) {
      return NextResponse.json({ error: 'Category parameter is required' }, { status: 400 })
    }

    // Fetch all unique subcategories for this category
    // Using a select distinct query to get all unique values
    const { data, error } = await supabase
      .from('assets')
      .select('subcategory')
      .eq('category', category)
      .not('subcategory', 'is', null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Extract unique subcategories, filter out 'other' and 'general', and sort
    const subcategories = Array.from(
      new Set(
        (data || [])
          .map((item: any) => item.subcategory)
          .filter((subcat: string | null | undefined) => 
            subcat && 
            subcat !== 'other' && 
            subcat !== 'general' &&
            subcat !== category // Also filter out if subcategory equals category (nested folder issue)
          )
      )
    ).sort()

    return NextResponse.json({ subcategories })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
