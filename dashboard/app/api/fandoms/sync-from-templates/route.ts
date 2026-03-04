import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { ensureFandomsFromTemplates } from '@/lib/fandomsSync'

/**
 * POST /api/fandoms/sync-from-templates
 * Scans all templates for distinct fandom values and ensures each has a row in fandoms.
 * Creates any missing fandoms so that scraped assets can be categorized correctly.
 */
export async function POST() {
  try {
    const supabase = createAdminClient()

    const { data: templates, error } = await supabase
      .from('templates')
      .select('fandom')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const fandomStrings = [
      ...new Set(
        (templates || [])
          .map((t) => (t as { fandom: string | null }).fandom)
          .filter((f): f is string => Boolean(f?.trim()))
      ),
    ]

    const { created, existing } = await ensureFandomsFromTemplates(fandomStrings)

    return NextResponse.json({
      created,
      existing,
      message:
        created.length > 0
          ? `Created ${created.length} fandom(s): ${created.join(', ')}. ${existing.length} already existed.`
          : `All ${existing.length} fandom(s) already exist. Nothing to create.`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
