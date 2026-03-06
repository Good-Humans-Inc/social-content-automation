import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { listSubcategoriesFromGcs, isGcsConfigured } from '@/lib/gcs'

const IMAGES_PER_VIDEO = 35
const IMAGES_PER_CAROUSEL = 4 // 4 images = one 2x2 grid slide (plus first text slide)
const PREFERRED_MUSIC_GENRE = 'phonk'

/** Generation modes: 'video' = rapid video jobs only; 'carousel' = carousel (grid) jobs only; 'both' = both. Extend this array to add new modes (e.g. 'slideshow'). */
export const GENERATION_MODES = ['video', 'carousel', 'both'] as const
export type GenerationMode = (typeof GENERATION_MODES)[number]

function isGenerationMode(value: unknown): value is GenerationMode {
  return typeof value === 'string' && GENERATION_MODES.includes(value as GenerationMode)
}

// Map template fandom to assets category (folder structure)
const FANDOM_TO_CATEGORY: Record<string, string> = {
  jjk: 'jjk',
  jujutsu_kaisen: 'jjk',
  love_and_deepspace: 'lads',
  lads: 'lads',
  genshin: 'genshin',
  genshin_impact: 'genshin',
  generic_anime: 'generic_anime',
}

function getAssetsCategory(fandom: string): string {
  const normalized = (fandom || '').toLowerCase().replace(/\s+/g, '_')
  return FANDOM_TO_CATEGORY[normalized] ?? normalized
}

// Tags that are not character names (fandom/generic) - skip when matching so we don't match "jjk" etc.
const NON_CHARACTER_TAGS = new Set([
  'jjk', 'jujutsukaisen', 'anime', 'fyp', 'animegirl', 'anime_otome', 'otome', 'shounen',
  'love', 'deepspace', 'lads', 'genshin', 'genshinimpact', 'mha', 'demonslayer', 'bluelock',
])

/** Normalize for flexible matching: lowercase, collapse spaces/underscores/hyphens to nothing */
function normalizeForMatch(s: string): string {
  return (s || '').toLowerCase().replace(/[\s_\-]+/g, '')
}

/** Ensure tags are a flat array of individual tag strings (handles DB returning string or comma-separated) */
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

/** True if template has a tag that matches the selected fandom category (e.g. #jjk when fandom is jjk) */
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

/**
 * Extract character subcategory from template tags by matching asset subcategories.
 * Uses flexible matching so "#inumaki" matches subcategory "toge_inumaki", "#miwa" matches "kasumi_miwa", etc.
 * Returns the actual subcategory value from the DB for use in asset queries.
 */
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

/** Shuffle array and return first n elements */
function shuffleAndTake<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const { fandom: fandomFilter, debug: debugMode, mode: modeParam } = body

    const mode: GenerationMode = isGenerationMode(modeParam) ? modeParam : 'video'

    const fandomCategory = typeof fandomFilter === 'string' && fandomFilter.trim() ? fandomFilter.trim().toLowerCase() : null
    if (!fandomCategory) {
      return NextResponse.json(
        { error: 'fandom is required. Choose a fandom to create jobs for all its unused templates.' },
        { status: 400 }
      )
    }

    // Fetch all accounts to distribute jobs evenly (1–2 per account for daily upload)
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .order('created_at', { ascending: true })

    if (accountsError || !accounts?.length) {
      return NextResponse.json(
        { error: 'No accounts found. Add at least one account to distribute jobs.' },
        { status: 400 }
      )
    }

    // Get music assets (prefer phonk genre) – shared by video and carousel
    const { data: phonkAssets } = await supabase
      .from('assets')
      .select('id')
      .eq('category', 'music')
      .contains('tags', [PREFERRED_MUSIC_GENRE])
      .limit(100)

    const { data: anyMusicAssets } = await supabase
      .from('assets')
      .select('id')
      .eq('category', 'music')
      .limit(200)

    const pickMusicId = (): string | null => {
      const pool = (phonkAssets?.length ? phonkAssets : anyMusicAssets) || []
      if (pool.length === 0) return null
      return pool[Math.floor(Math.random() * pool.length)].id
    }

    const createdVideos: { job_id: string; template_id: string; character?: string; account_id: string }[] = []
    const createdCarousels: { job_id: string; template_id: string; character?: string; account_id: string }[] = []
    const errors: string[] = []
    const debugInfo: {
      subcategoriesInDb: string[]
      subcategoriesFromGcs?: string[]
      summary?: string
      failedTemplates: Array<{
        template_id: string
        raw_tags: unknown
        normalized_tags: string[]
        candidate_tags: string[]
        subcategories: string[]
      }>
    } = { subcategoriesInDb: [], failedTemplates: [] }

    // Fetch subcategories once for the selected category (reuse for video + carousel + optional debug)
    // Include all category aliases that map to this fandom (e.g. jjk and jujutsu_kaisen)
    const categoryAliases = [
      fandomCategory,
      ...Object.entries(FANDOM_TO_CATEGORY)
        .filter(([, v]) => v === fandomCategory)
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
          s && s !== 'other' && s !== 'general' && s !== fandomCategory
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
        const parts = ((row as any).storage_path || '').split('/')
        if (parts.length >= 4 && parts[2]) {
          pathSubcats.push(parts[2])
        }
      }
    }

    let subcategories = Array.from(
      new Set([...fromColumn, ...pathSubcats])
    ).filter(
      (s) => s && s !== 'other' && s !== 'general' && s !== fandomCategory
    )
    // When GCS is configured, merge in subcategories from bucket structure (assets/{category}/{subcategory}/)
    let subcategoriesFromGcs: string[] = []
    if (isGcsConfigured()) {
      subcategoriesFromGcs = await listSubcategoriesFromGcs(fandomCategory)
      if (subcategoriesFromGcs.length > 0) {
        subcategories = Array.from(new Set([...subcategories, ...subcategoriesFromGcs])).filter(
          (s) => s && s !== 'other' && s !== 'general' && s !== fandomCategory
        )
      }
    }
    if (debugMode) {
      debugInfo.subcategoriesInDb = [...subcategories].sort()
      if (subcategoriesFromGcs.length > 0) {
        debugInfo.subcategoriesFromGcs = subcategoriesFromGcs.sort()
      }
    }

    // --- Video generation: rapid video jobs (when mode is 'video' or 'both') ---
    if (mode === 'video' || mode === 'both') {
      const { data: templatesAll } = await supabase
        .from('templates')
        .select('id, fandom, tags, overlay, carousel_type')
        .is('used', null)
        .not('tags', 'is', null)
        .limit(500)

      const filteredVideo = (templatesAll || []).filter(
        (t: any) =>
          getAssetsCategory(t.fandom) === fandomCategory ||
          tagsContainFandomCategory(t.tags, fandomCategory)
      )
      const rapidTemplates = filteredVideo.filter(
        (t: any) =>
          Array.isArray(t.overlay) &&
          t.overlay.length > 0 &&
          t.carousel_type !== 'character_grid'
      )
      const candidateVideoTemplates = rapidTemplates.length > 0 ? rapidTemplates : filteredVideo

      for (const template of candidateVideoTemplates) {
        const category = fandomCategory

        let ids: string[] = []
        let character: string | null = null
        const { data: linkedAssets, error: linkedError } = await supabase
          .from('asset_templates')
          .select('asset_id')
          .eq('template_id', template.id)
          .limit(500)

        if (!linkedError && linkedAssets && linkedAssets.length >= IMAGES_PER_VIDEO) {
          ids = linkedAssets.map((a: any) => a.asset_id)
          character = findCharacterFromTags(template.tags, subcategories) || 'template_linked'
        } else {
          character = findCharacterFromTags(template.tags, subcategories)
          if (!character) {
            errors.push(`Template ${template.id}: no character found in tags for category ${category}`)
            if (debugMode) {
              const normalized = normalizeTemplateTags(template.tags)
              const candidateTags = normalized
                .map((t: string) => (t || '').replace(/^#/, '').trim().toLowerCase())
                .filter((r: string) => r && !NON_CHARACTER_TAGS.has(r))
              debugInfo.failedTemplates.push({
                template_id: template.id,
                raw_tags: template.tags,
                normalized_tags: normalized,
                candidate_tags: candidateTags,
                subcategories: [...subcategories],
              })
            }
            continue
          }

          const byCategory = await supabase
            .from('assets')
            .select('id')
            .in('category', categoryAliases)
            .eq('subcategory', character)
            .limit(500)
          ids = (byCategory.data || []).map((a: any) => a.id)
          if (ids.length < IMAGES_PER_VIDEO) {
            const pathPrefix = `assets/${category}/${character}/`
            const byPath = await supabase
              .from('assets')
              .select('id')
              .like('storage_path', `${pathPrefix}%`)
              .limit(500)
            if (byPath.data?.length) {
              ids = byPath.data.map((a: any) => a.id)
            }
          }

          if (byCategory.error) {
            errors.push(`Template ${template.id}: ${byCategory.error.message}`)
            continue
          }
          if (ids.length < IMAGES_PER_VIDEO) {
            if (ids.length === 0) {
              errors.push(
                `Skipped: character "${character}" not scraped yet – no images in assets. Scrape this character first, then try again.`
              )
            } else {
              errors.push(
                `Skipped: character "${character}" has too few images (need ${IMAGES_PER_VIDEO}, found ${ids.length}). Scrape more assets for this character.`
              )
            }
            continue
          }
        }

        const selectedIds = shuffleAndTake(ids, IMAGES_PER_VIDEO)
        const musicAssetId = pickMusicId()
        const accountIndex = (createdVideos.length + createdCarousels.length) % accounts.length
        const accountId = accounts[accountIndex].id

        const { data: job, error: jobError } = await supabase
          .from('video_jobs')
          .insert({
            template_id: template.id,
            account_id: accountId,
            post_type: 'video',
            image_asset_ids: selectedIds,
            image_duration: 0.2,
            rapid_mode: true,
            music_asset_id: musicAssetId || null,
            music_url: null,
            character_name: character,
            visual_type: 'A',
            effect_preset: 'random',
            output_as_slides: false,
            status: 'pending',
            progress: 0,
            logs: [],
          })
          .select('id')
          .single()

        if (jobError) {
          errors.push(`Template ${template.id}: ${jobError.message}`)
          continue
        }

        await supabase
          .from('templates')
          .update({
            used: {
              job_id: job.id,
              used_at: new Date().toISOString(),
              account_id: accountId,
              character,
            },
          })
          .eq('id', template.id)

        createdVideos.push({
          job_id: job.id,
          template_id: template.id,
          character,
          account_id: accountId,
        })
      }
    }

    // --- Carousel generation: 4-image grid jobs (when mode is 'carousel' or 'both') ---
    if (mode === 'carousel' || mode === 'both') {
      const { data: templatesAllCarousel } = await supabase
        .from('templates')
        .select('id, fandom, tags, overlay, carousel_type, grid_images')
        .is('used', null)
        .not('tags', 'is', null)
        .limit(500)

      const filteredCarousel = (templatesAllCarousel || []).filter(
        (t: any) =>
          getAssetsCategory(t.fandom) === fandomCategory ||
          tagsContainFandomCategory(t.tags, fandomCategory)
      )
      const carouselTemplates = filteredCarousel.filter(
        (t: any) => t.carousel_type === 'character_grid' || t.grid_images === 4
      )

      for (const template of carouselTemplates) {
        const category = fandomCategory

        let ids: string[] = []
        let character: string | null = null
        const { data: linkedAssets } = await supabase
          .from('asset_templates')
          .select('asset_id')
          .eq('template_id', template.id)
          .limit(500)

        if (linkedAssets && linkedAssets.length >= IMAGES_PER_CAROUSEL) {
          ids = linkedAssets.map((a: any) => a.asset_id)
          character = findCharacterFromTags(template.tags, subcategories) || 'template_linked'
        } else {
          character = findCharacterFromTags(template.tags, subcategories)
          if (!character) {
            errors.push(`Carousel template ${template.id}: no character found in tags for category ${category}`)
            continue
          }

          const byCategory = await supabase
            .from('assets')
            .select('id')
            .in('category', categoryAliases)
            .eq('subcategory', character)
            .limit(500)
          ids = (byCategory.data || []).map((a: any) => a.id)
          if (ids.length < IMAGES_PER_CAROUSEL) {
            const pathPrefix = `assets/${category}/${character}/`
            const byPath = await supabase
              .from('assets')
              .select('id')
              .like('storage_path', `${pathPrefix}%`)
              .limit(500)
            if (byPath.data?.length) {
              ids = byPath.data.map((a: any) => a.id)
            }
          }

          if (ids.length < IMAGES_PER_CAROUSEL) {
            if (ids.length === 0) {
              errors.push(`Skipped carousel: character "${character}" has no images. Scrape this character first.`)
            } else {
              errors.push(
                `Skipped carousel: character "${character}" has too few images (need ${IMAGES_PER_CAROUSEL}, found ${ids.length}).`
              )
            }
            continue
          }
        }

        const selectedIds = shuffleAndTake(ids, IMAGES_PER_CAROUSEL)
        const musicAssetId = pickMusicId()
        const accountIndex = (createdVideos.length + createdCarousels.length) % accounts.length
        const accountId = accounts[accountIndex].id

        const { data: job, error: jobError } = await supabase
          .from('video_jobs')
          .insert({
            template_id: template.id,
            account_id: accountId,
            post_type: 'carousel',
            carousel_layout: 'grid',
            image_asset_ids: selectedIds,
            image_duration: 3,
            rapid_mode: false,
            music_asset_id: musicAssetId || null,
            music_url: null,
            character_name: character,
            visual_type: 'A',
            effect_preset: 'none',
            output_as_slides: false,
            status: 'pending',
            progress: 0,
            logs: [],
          })
          .select('id')
          .single()

        if (jobError) {
          errors.push(`Carousel template ${template.id}: ${jobError.message}`)
          continue
        }

        await supabase
          .from('templates')
          .update({
            used: {
              job_id: job.id,
              used_at: new Date().toISOString(),
              account_id: accountId,
              character,
            },
          })
          .eq('id', template.id)

        createdCarousels.push({
          job_id: job.id,
          template_id: template.id,
          character,
          account_id: accountId,
        })
      }
    }

    // When only one mode is requested and nothing was created, return 400 with a clear message
    if (mode === 'video' && createdVideos.length === 0) {
      return NextResponse.json(
        {
          error: `No unused video templates for "${fandomCategory}". Add templates (with overlay, not character_grid) or clear "used" on existing ones.`,
        },
        { status: 400 }
      )
    }
    if (mode === 'carousel' && createdCarousels.length === 0) {
      return NextResponse.json(
        {
          error: `No unused carousel templates for "${fandomCategory}". Add character_grid templates for this fandom or clear "used" on existing ones.`,
        },
        { status: 400 }
      )
    }

    if (debugMode && debugInfo.failedTemplates.length > 0) {
      const have = debugInfo.subcategoriesInDb.length
        ? debugInfo.subcategoriesInDb.join(', ')
        : 'none'
      const first = debugInfo.failedTemplates[0]
      const want = first?.candidate_tags?.length ? first.candidate_tags.join(', ') : '?'
      debugInfo.summary = `Templates use character tags (e.g. #choso, #yuji). A job is only created when that character exists in your assets. Your assets for this fandom have character folders: ${have}. This template wants one of: ${want}. Scrape those characters (e.g. in Assets or via your scraper) so their folder appears in the list, then run Auto Generate again.`
    }

    const created = [...createdVideos, ...createdCarousels]
    const parts: string[] = []
    if (createdVideos.length > 0) parts.push(`${createdVideos.length} video(s)`)
    if (createdCarousels.length > 0) parts.push(`${createdCarousels.length} carousel(s)`)
    const message =
      created.length > 0
        ? `Created ${parts.join(' and ')} across ${accounts.length} account(s).${errors.length > 0 ? ` ${errors.length} skipped.` : ''}`
        : 'No jobs created.'

    return NextResponse.json({
      created,
      createdVideos,
      createdCarousels,
      errors: errors.length > 0 ? errors : undefined,
      accountsUsed: accounts.length,
      message,
      ...(debugMode && { debug: debugInfo }),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
