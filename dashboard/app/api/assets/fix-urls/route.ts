import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const body = await request.json()
    const { category, subcategory } = body

    if (!category || !subcategory) {
      return NextResponse.json(
        { error: 'Category and subcategory are required' },
        { status: 400 }
      )
    }

    // Get all assets for this category/subcategory
    const { data: assets, error: fetchError } = await supabase
      .from('assets')
      .select('id, url, storage_path, category, subcategory')
      .eq('category', category)
      .eq('subcategory', subcategory)

    if (fetchError) {
      return NextResponse.json(
        { error: `Failed to fetch assets: ${fetchError.message}` },
        { status: 500 }
      )
    }

    if (!assets || assets.length === 0) {
      return NextResponse.json({
        message: 'No assets found for this category/subcategory',
        fixed: 0,
        total: 0
      })
    }

    let fixedCount = 0
    const errors: string[] = []

    // Fix each asset URL
    for (const asset of assets) {
      try {
        // Extract filename from current URL or storage_path
        let fileName = ''
        
        if (asset.storage_path) {
          // Try to extract from storage_path first
          const pathParts = asset.storage_path.split('/')
          fileName = pathParts[pathParts.length - 1] || ''
        }
        
        // If no filename from storage_path, try to extract from URL
        if (!fileName && asset.url) {
          // Handle broken URL pattern: .../storage/v1/object/public/assets/assets/lads/lads/filename.jpg
          // Or correct pattern: .../storage/v1/object/public/assets/lads/aislinn/filename.jpg
          const urlMatch = asset.url.match(/\/storage\/v1\/object\/public\/assets\/(.+)/)
          if (urlMatch) {
            const pathAfterAssets = urlMatch[1].split('?')[0] // Remove query params
            const pathParts = pathAfterAssets.split('/')
            // Get the last part which should be the filename
            fileName = pathParts[pathParts.length - 1] || ''
          } else {
            // Fallback: just get the last part of the URL
            const urlParts = asset.url.split('/')
            fileName = urlParts[urlParts.length - 1].split('?')[0]
          }
        }

        if (!fileName) {
          errors.push(`Asset ${asset.id}: Could not extract filename from URL or storage_path`)
          continue
        }

        // Construct correct path: assets/{category}/{subcategory}/{filename}
        const correctPath = `assets/${category}/${subcategory}/${fileName}`
        
        // Construct correct URL
        const { data: urlData } = supabase.storage.from('assets').getPublicUrl(correctPath)
        const correctUrl = urlData.publicUrl

        // Update the asset in database
        const { error: updateError } = await supabase
          .from('assets')
          .update({
            url: correctUrl,
            storage_path: correctPath
          })
          .eq('id', asset.id)

        if (updateError) {
          errors.push(`Asset ${asset.id}: ${updateError.message}`)
        } else {
          fixedCount++
        }
      } catch (error: any) {
        errors.push(`Asset ${asset.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      message: `Fixed ${fixedCount} out of ${assets.length} assets`,
      fixed: fixedCount,
      total: assets.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
