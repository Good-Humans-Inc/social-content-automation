import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const FANDOM_TO_CATEGORY: Record<string, string> = {
  jjk: 'jjk',
  jujutsu_kaisen: 'jjk',
  love_and_deepspace: 'lads',
  lads: 'lads',
  genshin: 'genshin',
  genshin_impact: 'genshin',
  generic_anime: 'generic_anime',
}

const CATEGORY_LABELS: Record<string, string> = {
  jjk: 'Jujutsu Kaisen (JJK)',
  lads: 'Love and Deepspace (LADS)',
  genshin: 'Genshin Impact',
  generic_anime: 'Generic Anime',
}

const NON_CHARACTER_TAGS = new Set([
  'jjk', 'jujutsukaisen', 'anime', 'fyp', 'animegirl', 'anime_otome', 'otome', 'shounen',
  'love', 'deepspace', 'lads', 'genshin', 'genshinimpact', 'mha', 'demonslayer', 'bluelock',
])

function getAssetsCategory(fandom: string): string {
  const normalized = (fandom || '').toLowerCase().replace(/\s+/g, '_')
  return FANDOM_TO_CATEGORY[normalized] ?? normalized
}

function normalizeForMatch(s: string): string {
  return (s || '').toLowerCase().replace(/[\s_\-]+/g, '')
}

function normalizeTemplateTags(tags: string[] | string | null | undefined): string[] {
  if (tags == null) return []
  const arr = Array.isArray(tags) ? tags : [tags]
  const flat: string[] = []
  for (const t of arr) {
    const s = (t || '').trim()
    if (!s) continue
    if (s.includes(',')) {
      flat.push(...s.split(',').map((x) => x.trim()).filter(Boolean))
    } else {
      flat.push(s)
    }
  }
  return flat
}

function tagsContainFandomCategory(tags: string[] | string | null | undefined, fandomCategory: string): boolean {
  const normalized = normalizeTemplateTags(tags)
  const want = fandomCategory.toLowerCase()
  for (const tag of normalized) {
    const raw = (tag || '').replace(/^#/, '').trim().toLowerCase()
    if (!raw) continue
    const norm = normalizeForMatch(raw)
    if (norm === want || norm === want.replace(/_/g, '')) return true
  }
  return false
}

function findCharacterFromTags(
  templateTags: string[] | string | null | undefined,
  subcategories: string[]
): string | null {
  const tags = normalizeTemplateTags(templateTags)
  if (!tags.length || !subcategories.length) return null
  for (const tag of tags) {
    const raw = (tag || '').replace(/^#/, '').trim().toLowerCase()
    if (!raw || NON_CHARACTER_TAGS.has(raw)) continue
    const normTag = normalizeForMatch(raw)
    for (const subcat of subcategories) {
      if (!subcat || subcat === 'other' || subcat === 'general') continue
      const normSubcat = normalizeForMatch(subcat)
      if (normTag === normSubcat || normSubcat.includes(normTag) || normTag.includes(normSubcat)) {
        return subcat
      }
    }
  }
  return null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const categoriesToBuild = ['jjk', 'lads', 'genshin', 'generic_anime']

    const { data: templates, error: templatesError } = await supabase
      .from('templates')
      .select('id, fandom, tags')
      .not('tags', 'is', null)
      .limit(1000)

    if (templatesError) {
      return NextResponse.json({ error: templatesError.message }, { status: 500 })
    }

    const result: {
      category: string
      label: string
      subcategories: Array<{ name: string; asset_count: number }>
      templates: Array<{
        template_id: string
        fandom: string
        tags: string[]
        matched_subcategory: string | null
      }>
    }[] = []

    for (const category of categoriesToBuild) {
      const categoryAliases = [
        category,
        ...Object.entries(FANDOM_TO_CATEGORY)
          .filter(([, v]) => v === category)
          .map(([k]) => k),
      ]

      // 1. From the subcategory column
      const { data: subcatRows } = await supabase
        .from('assets')
        .select('subcategory')
        .in('category', categoryAliases)
        .not('subcategory', 'is', null)

      const fromColumn = (subcatRows || [])
        .map((r: any) => r.subcategory)
        .filter(
          (s: string | null) =>
            s && s !== 'other' && s !== 'general' && s !== category
        )

      // 2. From storage_path: assets/{category}/{subcategory}/filename -> extract subcategory
      const pathSubcats: string[] = []
      for (const alias of categoryAliases) {
        const { data: pathRows } = await supabase
          .from('assets')
          .select('storage_path')
          .like('storage_path', `assets/${alias}/%`)
          .limit(5000)

        for (const row of pathRows || []) {
          const parts = (row.storage_path || '').split('/')
          // assets / {category} / {subcategory} / filename
          if (parts.length >= 4 && parts[2]) {
            pathSubcats.push(parts[2])
          }
        }
      }

      const subcategoryNames = Array.from(
        new Set([...fromColumn, ...pathSubcats])
      ).filter(
        (s) => s && s !== 'other' && s !== 'general' && s !== category
      ).sort()

      // Count assets per subcategory (from subcategory column + storage_path)
      const assetCounts: Record<string, number> = {}
      for (const subcat of subcategoryNames) {
        // Count by subcategory column
        const { count: colCount } = await supabase
          .from('assets')
          .select('id', { count: 'exact', head: true })
          .in('category', categoryAliases)
          .eq('subcategory', subcat)
        // Count by storage_path if subcategory column gave 0
        let total = colCount || 0
        if (total === 0) {
          for (const alias of categoryAliases) {
            const { count: pathCount } = await supabase
              .from('assets')
              .select('id', { count: 'exact', head: true })
              .like('storage_path', `assets/${alias}/${subcat}/%`)
            total += pathCount || 0
          }
        }
        assetCounts[subcat] = total
      }

      const subcategories = subcategoryNames.map((name) => ({
        name,
        asset_count: assetCounts[name] || 0,
      }))

      const templatesInCategory = (templates || []).filter(
        (t: any) =>
          getAssetsCategory(t.fandom) === category ||
          tagsContainFandomCategory(t.tags, category)
      )

      const templateMatches = templatesInCategory.map((t: any) => ({
        template_id: t.id,
        fandom: t.fandom,
        tags: Array.isArray(t.tags) ? t.tags : [t.tags].filter(Boolean),
        matched_subcategory: findCharacterFromTags(t.tags, subcategoryNames),
      }))

      result.push({
        category,
        label: CATEGORY_LABELS[category] || category,
        subcategories,
        templates: templateMatches,
      })
    }

    return NextResponse.json({ categories: result })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
