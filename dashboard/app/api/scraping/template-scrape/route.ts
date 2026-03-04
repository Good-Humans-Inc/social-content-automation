import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { addToTemplateQueue, getQueueStatus } from '@/lib/templateQueue'
import { ensureFandomsFromTemplates } from '@/lib/fandomsSync'

const IMAGES_PER_TEMPLATE = 35

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables')
  }
  return new OpenAI({ apiKey })
}

interface TemplateRow {
  id: string
  persona: string | null
  fandom: string | null
  intensity: string | null
  overlay: string[] | null
  caption: string | null
  tags: string[] | string | null
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

async function generateSearchTermsForTemplates(
  openai: OpenAI,
  templates: TemplateRow[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  const batchSize = 10
  for (let i = 0; i < templates.length; i += batchSize) {
    const batch = templates.slice(i, i + batchSize)

    const templateDescriptions = batch.map((t, idx) => {
      const tags = normalizeTemplateTags(t.tags)
        .map((tag) => tag.replace(/^#/, ''))
        .join(', ')
      const overlayText = Array.isArray(t.overlay) ? t.overlay.join(' | ') : ''
      return `Template ${idx + 1} (ID: ${t.id}):
  - Overlay text (MAIN PROMPT - use this for the image scenario): ${overlayText || 'none'}
  - Caption: ${t.caption || 'none'}
  - Fandom: ${t.fandom || 'unknown'}
  - Persona: ${t.persona || 'unknown'}
  - Tags: ${tags || 'none'}
  - Intensity: ${t.intensity || 'T0'}`
    }).join('\n\n')

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at generating Pinterest search queries to find images that match a specific social post template.

CRITICAL: The search query must reflect the ACTIVITY or SCENE described in the OVERLAY TEXT and CAPTION — these are the "prompt" that describes what the post is about. The images we scrape should look like what the overlay is talking about.

Examples of correct behavior:
- Overlay "reading jjk manga at 2am" + caption "sleep schedule? cursed." → search for images of someone reading manga / reading jjk manga (e.g. "reading jjk manga" or "jujutsu kaisen manga reading")
- Overlay "one blindfolded man holds the fanbase together" + tags #gojo → search for Gojo character images (e.g. "gojo satoru jujutsu kaisen")
- Overlay "POV: main character energy" + fandom lads → search for that game's protagonist / main character aesthetic

Rules:
- PRIORITIZE the overlay and caption: extract the concrete activity, scene, or subject (e.g. "reading manga", "reading jjk manga", "manga at night") and use that in the query. Do NOT default to generic "fandom + aesthetic" like "jujutsu kaisen manga cozy aesthetic" when the overlay clearly describes a specific scenario like "reading jjk manga".
- Use full anime/game names where helpful: "jujutsu kaisen" for jjk, "love and deepspace" for lads.
- Keep queries short: 3–6 words. No hashtags. No "template" or "social media".
- If overlay/caption describe an activity (reading, watching, crying, etc.), the search should find images that visually match that activity or mood.
- Only add words like "aesthetic", "wallpaper", "soft", "dark" when they match the overlay mood; do not add them by default.

Respond with ONLY a JSON object mapping template IDs to search queries. Example:
{"anime_otome_070": "reading jjk manga", "anime_otome_071": "gojo satoru jujutsu kaisen"}`
        },
        {
          role: 'user',
          content: `Generate Pinterest search queries for these ${batch.length} templates:\n\n${templateDescriptions}`
        }
      ],
    })

    const content = completion.choices[0]?.message?.content || '{}'
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        for (const [id, query] of Object.entries(parsed)) {
          if (typeof query === 'string' && query.trim()) {
            results.set(id, query.trim())
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse OpenAI response:', content, e)
      for (const t of batch) {
        const tags = normalizeTemplateTags(t.tags)
          .map((tag) => tag.replace(/^#/, ''))
          .filter((tag) => tag.length > 2)
        const fallback = [t.fandom || '', ...tags.slice(0, 3), 'anime aesthetic']
          .filter(Boolean)
          .join(' ')
        results.set(t.id, fallback)
      }
    }
  }

  return results
}

function generatePinterestSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query)
  return `https://www.pinterest.com/search/pins/?q=${encoded}`
}

export async function POST(request: NextRequest) {
  try {
    const openai = getOpenAIClient()
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const { fandom, intensity, limit: maxTemplates, template_ids } = body

    let query = supabase
      .from('templates')
      .select('id, persona, fandom, intensity, overlay, caption, tags')
      .is('used', null)
      .order('created_at', { ascending: true })

    if (fandom) {
      query = query.eq('fandom', fandom)
    }

    if (intensity && ['T0', 'T1', 'T2'].includes(String(intensity).toUpperCase())) {
      query = query.eq('intensity', String(intensity).toUpperCase())
    }

    if (template_ids && Array.isArray(template_ids) && template_ids.length > 0) {
      query = query.in('id', template_ids)
    }

    const useAll = maxTemplates === 'all' || maxTemplates === 'ALL' || (typeof maxTemplates === 'number' && maxTemplates <= 0)
    if (!useAll) {
      const limit = typeof maxTemplates === 'number' ? maxTemplates : parseInt(String(maxTemplates), 10) || 50
      query = query.limit(Math.min(limit, 5000))
    } else {
      query = query.limit(5000)
    }

    const { data: templates, error: templatesError } = await query

    if (templatesError) {
      return NextResponse.json({ error: templatesError.message }, { status: 500 })
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json(
        { error: 'No unused templates found matching the criteria.' },
        { status: 400 }
      )
    }

    // Ensure every template's fandom exists in fandoms table so uploads categorize correctly
    const fandomStrings = [...new Set(templates.map((t) => t.fandom).filter(Boolean) as string[])]
    await ensureFandomsFromTemplates(fandomStrings)

    const searchTerms = await generateSearchTermsForTemplates(openai, templates)

    const templateIds = templates.map((t) => t.id)
    const { data: linkRows } = await supabase
      .from('asset_templates')
      .select('template_id')
      .in('template_id', templateIds)

    const countByTemplate: Record<string, number> = {}
    for (const row of linkRows || []) {
      const tid = (row as { template_id: string }).template_id
      countByTemplate[tid] = (countByTemplate[tid] || 0) + 1
    }

    const queued: { template_id: string; search_query: string; pinterest_url: string; max_posts: number }[] = []
    const errors: string[] = []

    for (const template of templates) {
      const currentCount = countByTemplate[template.id] ?? 0
      if (currentCount >= IMAGES_PER_TEMPLATE) {
        continue
      }

      const searchQuery = searchTerms.get(template.id)
      if (!searchQuery) {
        errors.push(`Template ${template.id}: Failed to generate search query`)
        continue
      }

      const deficit = IMAGES_PER_TEMPLATE - currentCount
      const pinterestUrl = generatePinterestSearchUrl(searchQuery)

      addToTemplateQueue({
        template_id: template.id,
        target_urls: [pinterestUrl],
        source_type: 'pinterest',
        search_terms: [searchQuery],
        max_posts: deficit,
      })

      queued.push({
        template_id: template.id,
        search_query: searchQuery,
        pinterest_url: pinterestUrl,
        max_posts: deficit,
      })
    }

    return NextResponse.json({
      queued,
      errors: errors.length > 0 ? errors : undefined,
      queue_status: getQueueStatus(),
      message: `Queued ${queued.length} template scraping task(s). The extension will process them one by one. Each template will get ${IMAGES_PER_TEMPLATE} images.`,
    })
  } catch (error: any) {
    console.error('Template scrape error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ queue_status: getQueueStatus() })
}
