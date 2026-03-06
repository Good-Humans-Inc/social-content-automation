import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getPromptForTier } from './prompts'
import {
  getCarouselPromptForTier,
  validateCarouselEntry,
  type CarouselEntry,
} from './carouselPrompts'

const TIERS = ['T0', 'T1', 'T2'] as const
type Tier = (typeof TIERS)[number]

/** Template format: 'video' = single-overlay video templates; 'carousel' = multi-slide carousel (3–10 slides). */
const FORMATS = ['video', 'carousel'] as const
type TemplateFormat = (typeof FORMATS)[number]

function isTemplateFormat(value: unknown): value is TemplateFormat {
  return typeof value === 'string' && FORMATS.includes(value as TemplateFormat)
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables')
  }
  return new OpenAI({ apiKey })
}

/** Normalize a display name to a fandom key (lowercase, &→and, no punctuation, spaces→underscores). */
function normalizeFandomKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'fandom'
}

/** Build one fandom row for the prompt (e.g. for custom/new fandom). */
function toFandomRow(displayName: string, normalizedKey: string): Record<string, string> {
  return {
    'Canonical Fandom Name': displayName.trim(),
    'Fandom Name Variations': displayName.trim(),
    'Fandom Category': 'N/A',
    'Core Age Range': 'N/A',
    'Core Gender Distribution': 'N/A',
    'Brief Description of Fandom/Work': 'N/A',
    'Normalized Fandom Name': normalizedKey,
    'Normalized Persona Name': '',
  }
}

/** Build fandom_rows for the prompt from DB fandoms. Optional filter by short_id. */
async function getFandomRowsFromDb(fandomFilter?: string): Promise<Record<string, string>[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('fandoms')
    .select('short_id, display_name, full_name, aliases')
    .order('display_name', { ascending: true })
  if (fandomFilter?.trim()) {
    query = query.eq('short_id', fandomFilter.trim())
  }
  const { data: fandoms, error } = await query
  if (error) {
    throw new Error(`Failed to load fandoms: ${error.message}`)
  }
  return (fandoms || []).map((f: { short_id: string; display_name: string; full_name: string; aliases?: string[] }) => ({
    'Canonical Fandom Name': f.display_name,
    'Fandom Name Variations': (f.aliases || [f.full_name]).join(', '),
    'Fandom Category': 'N/A',
    'Core Age Range': 'N/A',
    'Core Gender Distribution': 'N/A',
    'Brief Description of Fandom/Work': 'N/A',
    'Normalized Fandom Name': f.short_id,
    'Normalized Persona Name': '',
  }))
}

/** Build fandom_rows: either only custom fandom, or DB list (+ optional custom fandom). */
async function getFandomRows(options: {
  fandomFilter?: string
  customFandom?: string
  customFandomOnly?: boolean
}): Promise<string> {
  const { fandomFilter, customFandom, customFandomOnly } = options
  const customName = customFandom?.trim()

  if (customFandomOnly && customName) {
    const key = normalizeFandomKey(customName)
    const rows = [toFandomRow(customName, key)]
    return JSON.stringify(rows, null, 0)
  }

  const rows = await getFandomRowsFromDb(fandomFilter)
  if (customName) {
    const key = normalizeFandomKey(customName)
    rows.push(toFandomRow(customName, key))
  }
  return JSON.stringify(rows, null, 0)
}

/** Get next sequential numeric id for persona from templates table */
async function getNextStartId(persona: string): Promise<number> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('templates')
    .select('id')
    .eq('persona', persona)
  if (error) throw new Error(error.message)
  const prefix = `${persona}_`
  let maxNum = 0
  for (const row of rows || []) {
    const id = (row as { id: string }).id
    if (id.startsWith(prefix)) {
      const num = parseInt(id.slice(prefix.length), 10)
      if (!Number.isNaN(num) && num > maxNum) maxNum = num
    }
  }
  return maxNum + 1
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      tier,
      n,
      persona,
      fandom: fandomFilter,
      start_id: startIdParam,
      custom_fandom: customFandom,
      custom_fandom_only: customFandomOnly,
      format: formatParam,
    } = body as {
      tier?: string
      n?: number
      persona?: string
      fandom?: string
      start_id?: number
      custom_fandom?: string
      custom_fandom_only?: boolean
      format?: string
    }

    const format: TemplateFormat = isTemplateFormat(formatParam) ? formatParam : 'video'

    const tierNorm = tier ? String(tier).toUpperCase() : ''
    if (!TIERS.includes(tierNorm as Tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Use T0, T1, or T2' },
        { status: 400 }
      )
    }
    const N = typeof n === 'number' ? Math.max(1, Math.min(n, 100)) : 10
    const personaStr = (persona && String(persona).trim()) || 'anime_otome'

    let start_id: number
    if (typeof startIdParam === 'number' && startIdParam >= 1) {
      start_id = startIdParam
    } else {
      start_id = await getNextStartId(personaStr)
    }

    const fandom_rows = await getFandomRows({
      fandomFilter,
      customFandom,
      customFandomOnly: !!customFandomOnly,
    })

    const openai = getOpenAIClient()
    const prompt =
      format === 'carousel'
        ? getCarouselPromptForTier(tierNorm as Tier, {
            N,
            persona: personaStr,
            start_id,
            fandom_rows,
          })
        : getPromptForTier(tierNorm as Tier, {
            N,
            persona: personaStr,
            start_id,
            fandom_rows,
          })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
    })

    const content = completion.choices[0]?.message?.content?.trim() || ''
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const errors: string[] = []
    const supabase = await createClient()

    if (format === 'carousel') {
      const carouselTemplates: Array<{
        id: string
        persona: string
        fandom: string
        intensity: string
        overlay: string[]
        caption: string
        tags: string[]
        carousel_type: string
        used: null
      }> = []

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>
          const entry: CarouselEntry = {
            id: typeof parsed.id === 'string' ? parsed.id.trim() : '',
            persona: typeof parsed.persona === 'string' ? parsed.persona.trim() : personaStr,
            fandom: typeof parsed.fandom === 'string' ? parsed.fandom.trim() : '',
            intensity: (typeof parsed.intensity === 'string' ? parsed.intensity.trim() : tierNorm) as 'T0' | 'T1' | 'T2',
            format: 'carousel',
            slide_count: typeof parsed.slide_count === 'number' ? parsed.slide_count : 0,
            slides: Array.isArray(parsed.slides)
              ? (parsed.slides as Array<{ slide: number; overlay: string[] }>).map((s) => ({
                  slide: s.slide,
                  overlay: Array.isArray(s.overlay) ? (s.overlay as string[]).filter((x) => typeof x === 'string') : [],
                }))
              : [],
            caption: typeof parsed.caption === 'string' ? parsed.caption.trim() : '',
            tags: Array.isArray(parsed.tags)
              ? (parsed.tags as string[]).map((t) => {
                  const s = typeof t === 'string' ? t.trim() : ''
                  return s ? (s.startsWith('#') ? s : `#${s}`) : ''
                }).filter(Boolean)
              : [],
            used: null,
          }

          const validationErrors = validateCarouselEntry(entry)
          if (validationErrors.length > 0) {
            errors.push(`${entry.id || 'entry'}: ${validationErrors.join('; ')}`)
            continue
          }

          const overlayForDb = entry.slides.map((s) => s.overlay.join('\n'))
          carouselTemplates.push({
            id: entry.id,
            persona: entry.persona,
            fandom: entry.fandom,
            intensity: entry.intensity,
            overlay: overlayForDb,
            caption: entry.caption,
            tags: entry.tags,
            carousel_type: 'multi_slide',
            used: null,
          })
        } catch (e) {
          errors.push(`Parse error: ${line.slice(0, 80)}...`)
        }
      }

      if (carouselTemplates.length === 0) {
        return NextResponse.json(
          {
            error: 'No valid carousel templates could be parsed from the model output.',
            raw_preview: content.slice(0, 500),
            parse_errors: errors,
          },
          { status: 422 }
        )
      }

      const inserted: string[] = []
      for (const t of carouselTemplates) {
        const { error: insertError } = await supabase.from('templates').insert({
          id: t.id,
          persona: t.persona,
          fandom: t.fandom,
          intensity: t.intensity,
          overlay: t.overlay,
          caption: t.caption,
          tags: t.tags,
          carousel_type: t.carousel_type,
          used: null,
        })
        if (insertError) {
          errors.push(`${t.id}: ${insertError.message}`)
        } else {
          inserted.push(t.id)
        }
      }

      return NextResponse.json({
        created: inserted.length,
        format: 'carousel',
        start_id,
        ids: inserted,
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    const templates: Array<{
      id: string
      persona: string
      fandom: string
      intensity: string
      overlay: string[]
      caption: string
      tags: string[]
      used: null
    }> = []

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>
        const id = typeof parsed.id === 'string' ? parsed.id.trim() : ''
        const personaVal = typeof parsed.persona === 'string' ? parsed.persona.trim() : personaStr
        const fandomVal = typeof parsed.fandom === 'string' ? parsed.fandom.trim() : ''
        const intensityVal = typeof parsed.intensity === 'string' ? parsed.intensity.trim() : tierNorm
        const overlayVal = Array.isArray(parsed.overlay)
          ? (parsed.overlay as string[]).filter((x) => typeof x === 'string')
          : []
        const captionVal = typeof parsed.caption === 'string' ? parsed.caption.trim() : ''
        const tagsVal = Array.isArray(parsed.tags)
          ? (parsed.tags as string[]).map((t) => {
              const s = typeof t === 'string' ? t.trim() : ''
              return s ? (s.startsWith('#') ? s : `#${s}`) : ''
            }).filter(Boolean)
          : []

        if (!id || !fandomVal || overlayVal.length === 0 || !captionVal || tagsVal.length === 0) {
          errors.push(`Invalid entry: missing required fields (id=${id})`)
          continue
        }

        templates.push({
          id,
          persona: personaVal,
          fandom: fandomVal,
          intensity: intensityVal,
          overlay: overlayVal,
          caption: captionVal,
          tags: tagsVal,
          used: null,
        })
      } catch (e) {
        errors.push(`Parse error: ${line.slice(0, 80)}...`)
      }
    }

    if (templates.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid templates could be parsed from the model output.',
          raw_preview: content.slice(0, 500),
          parse_errors: errors,
        },
        { status: 422 }
      )
    }

    const inserted: string[] = []
    for (const t of templates) {
      const { error: insertError } = await supabase.from('templates').insert({
        id: t.id,
        persona: t.persona,
        fandom: t.fandom,
        intensity: t.intensity,
        overlay: t.overlay,
        caption: t.caption,
        tags: t.tags,
        used: null,
      })
      if (insertError) {
        errors.push(`${t.id}: ${insertError.message}`)
      } else {
        inserted.push(t.id)
      }
    }

    return NextResponse.json({
      created: inserted.length,
      format: 'video',
      start_id,
      ids: inserted,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
