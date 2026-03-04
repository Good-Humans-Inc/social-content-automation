import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Normalize for matching: lowercase, remove spaces and underscores.
 * "Honkai Starrail" and "Honkaistarrail" both become "honkaistarrail".
 */
function normalizeForMatch(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .replace(/[^a-z0-9]/g, '') || ''
}

/**
 * Known abbreviations -> canonical normalized form (no spaces/underscores).
 * Used so "Hsr" matches the same fandom as "Honkai Starrail".
 */
const ABBREVIATION_TO_CANONICAL: Record<string, string> = {
  hsr: 'honkaistarrail',
  jjk: 'jujutsu_kaisen'.replace(/_/g, ''),
  lads: 'loveanddeepspace',
  gi: 'genshinimpact',
  csm: 'chainsawman',
}

function normalizedLookupKey(input: string): string {
  const n = normalizeForMatch(input)
  return ABBREVIATION_TO_CANONICAL[n] || n
}

/**
 * Normalize template fandom string to short_id (lowercase, underscores).
 */
function toShortId(fandom: string): string {
  return fandom
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'unknown'
}

/**
 * Humanize short_id to display name (e.g. "jujutsu_kaisen" -> "Jujutsu Kaisen").
 */
function toDisplayName(fandom: string): string {
  const trimmed = fandom.trim()
  if (!trimmed) return 'Unknown'
  return trimmed
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * To full_name for search (lowercase, spaces).
 */
function toFullName(fandom: string): string {
  const trimmed = fandom.trim()
  if (!trimmed) return 'unknown'
  return trimmed
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Ensure fandoms exist in the DB for each distinct fandom string (e.g. from templates).
 * Uses normalized matching so "Honkai Starrail", "Honkaistarrail", and "Hsr" become one fandom.
 * Creates missing ones. Returns created and existing short_ids.
 */
export async function ensureFandomsFromTemplates(
  fandomStrings: string[]
): Promise<{ created: string[]; existing: string[] }> {
  const supabase = createAdminClient()

  // Unique non-empty inputs
  const rawInputs = [...new Set(fandomStrings.map((s) => s.trim()).filter(Boolean))]
  if (rawInputs.length === 0) {
    return { created: [], existing: [] }
  }

  // Fetch all existing fandoms with short_id and aliases
  const { data: existingFandoms } = await supabase
    .from('fandoms')
    .select('id, short_id, aliases')

  // Build map: normalizedKey -> existing fandom's short_id (canonical)
  const normalizedToShortId = new Map<string, string>()
  for (const f of existingFandoms || []) {
    const row = f as { short_id: string; aliases?: string[] }
    const nShort = normalizeForMatch(row.short_id)
    if (nShort) normalizedToShortId.set(nShort, row.short_id)
    for (const alias of row.aliases || []) {
      const nAlias = normalizeForMatch(alias)
      if (nAlias && !normalizedToShortId.has(nAlias)) {
        normalizedToShortId.set(nAlias, row.short_id)
      }
    }
  }

  // Add abbreviation lookups: when we look up "hsr", we should find "honkaistarrail" if that exists
  for (const [abbrev, canonical] of Object.entries(ABBREVIATION_TO_CANONICAL)) {
    if (normalizedToShortId.has(canonical) && !normalizedToShortId.has(abbrev)) {
      normalizedToShortId.set(abbrev, normalizedToShortId.get(canonical)!)
    }
  }

  // Group raw inputs by their normalized lookup key (so we create one fandom per canonical name)
  const byCanonical = new Map<string, string[]>()
  for (const raw of rawInputs) {
    const key = normalizedLookupKey(raw)
    if (!key) continue
    if (!byCanonical.has(key)) byCanonical.set(key, [])
    byCanonical.get(key)!.push(raw)
  }

  const created: string[] = []
  const existing: string[] = []

  for (const [canonicalNormalized, raws] of byCanonical) {
    const existingShortId = normalizedToShortId.get(canonicalNormalized)

    if (existingShortId) {
      existing.push(existingShortId)
      // Optionally add new raw variants to that fandom's aliases (so upload categorization matches)
      const toAdd = raws.filter((r) => {
        const n = normalizeForMatch(r)
        return n && !normalizedToShortId.has(n)
      })
      if (toAdd.length > 0) {
        const f = (existingFandoms || []).find(
          (x) => (x as { short_id: string }).short_id === existingShortId
        ) as { id: string; short_id: string; aliases: string[] } | undefined
        if (f?.aliases) {
          const newAliases = [...new Set([...f.aliases, ...toAdd.map((r) => r.trim().toLowerCase())])]
          if (newAliases.length > f.aliases.length) {
            await supabase.from('fandoms').update({ aliases: newAliases, updated_at: new Date().toISOString() }).eq('id', f.id)
          }
        }
      }
      continue
    }

    // Create new fandom; use first raw as representative
    const representative = raws[0]!
    const shortId = toShortId(representative)
    if (!shortId || shortId === 'unknown') continue

    // Check again by short_id in case we just created it in a previous iteration
    const nShort = normalizeForMatch(shortId)
    if (normalizedToShortId.has(nShort)) {
      existing.push(normalizedToShortId.get(nShort)!)
      continue
    }

    const display_name = toDisplayName(representative)
    const full_name = toFullName(representative)
    const aliasSet = new Set<string>([shortId, full_name, display_name.toLowerCase(), canonicalNormalized])
    for (const r of raws) {
      aliasSet.add(r.trim().toLowerCase())
      aliasSet.add(toFullName(r))
      aliasSet.add(normalizeForMatch(r))
    }
    // Add known abbreviation if this fandom's normalized form matches
    for (const [abbrev, can] of Object.entries(ABBREVIATION_TO_CANONICAL)) {
      if (can === canonicalNormalized) aliasSet.add(abbrev)
    }
    const aliases = Array.from(aliasSet).filter(Boolean)

    const { error } = await supabase.from('fandoms').insert({
      short_id: shortId,
      display_name,
      full_name,
      aliases,
    })

    if (!error) {
      created.push(shortId)
      normalizedToShortId.set(canonicalNormalized, shortId)
      normalizedToShortId.set(normalizeForMatch(shortId), shortId)
      for (const a of aliases) {
        const na = normalizeForMatch(a)
        if (na) normalizedToShortId.set(na, shortId)
      }
    }
  }

  return {
    created,
    existing: [...new Set(existing)],
  }
}

export interface MergeResult {
  kept: string
  removed: string[]
  charactersMoved: number
  assetsUpdated: number
  templatesUpdated: number
}

/**
 * Find duplicate fandoms (same normalized key), merge them into one per group:
 * keep one, merge aliases, move characters to keeper, update assets/templates, delete duplicates.
 */
export async function mergeDuplicateFandoms(): Promise<{
  merged: MergeResult[]
  message: string
}> {
  const supabase = createAdminClient()

  const { data: fandoms, error: fetchError } = await supabase
    .from('fandoms')
    .select('id, short_id, display_name, full_name, aliases')
    .order('created_at', { ascending: true })

  if (fetchError) {
    throw new Error(fetchError.message)
  }

  if (!fandoms || fandoms.length === 0) {
    return { merged: [], message: 'No fandoms to merge.' }
  }

  // Group fandoms by normalized key (same key = duplicates)
  type FandomRow = { id: string; short_id: string; display_name: string; full_name: string; aliases?: string[] }
  const groupByKey = new Map<string, FandomRow[]>()
  for (const f of fandoms) {
    const row: FandomRow = f as FandomRow
    const key = normalizedLookupKey(row.short_id)
    if (!key) continue
    if (!groupByKey.has(key)) groupByKey.set(key, [])
    groupByKey.get(key)!.push(row)
  }

  const merged: MergeResult[] = []

  for (const [, group] of groupByKey) {
    if (group.length < 2) continue

    // Keep first (oldest by created_at); rest are removed
    const keeper = group[0] as { id: string; short_id: string; display_name: string; full_name: string; aliases: string[] }
    const toRemove = group.slice(1) as typeof group

    const allAliases = new Set<string>(keeper.aliases || [])
    for (const r of toRemove) {
      const row = r as { aliases?: string[] }
      for (const a of row.aliases || []) {
        if (a?.trim()) allAliases.add(a.trim().toLowerCase())
      }
      allAliases.add((r as { short_id: string }).short_id)
      allAliases.add((r as { display_name: string }).display_name?.toLowerCase())
    }
    const newAliases = Array.from(allAliases).filter(Boolean)

    // Update keeper's aliases
    await supabase
      .from('fandoms')
      .update({ aliases: newAliases, updated_at: new Date().toISOString() })
      .eq('id', keeper.id)

    let charactersMoved = 0
    const removeIds = toRemove.map((r) => (r as { id: string }).id)
    const removeShortIds = toRemove.map((r) => (r as { short_id: string }).short_id)

    // Reassign characters from duplicates to keeper
    const { data: chars } = await supabase
      .from('characters')
      .select('id')
      .in('fandom_id', removeIds)
    const charIds = (chars || []).map((c: { id: string }) => c.id)
    if (charIds.length > 0) {
      const { error: charErr } = await supabase
        .from('characters')
        .update({ fandom_id: keeper.id, updated_at: new Date().toISOString() })
        .in('fandom_id', removeIds)
      if (!charErr) charactersMoved = charIds.length
    }

    // Update assets: category was duplicate short_id -> set to keeper short_id
    const { count: assetsCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .in('category', removeShortIds)
    const assetsToUpdate = assetsCount ?? 0
    if (assetsToUpdate > 0) {
      await supabase
        .from('assets')
        .update({ category: keeper.short_id, updated_at: new Date().toISOString() })
        .in('category', removeShortIds)
    }

    // Update templates: fandom was duplicate short_id -> set to keeper short_id
    const { count: templatesCount } = await supabase
      .from('templates')
      .select('*', { count: 'exact', head: true })
      .in('fandom', removeShortIds)
    const templatesToUpdate = templatesCount ?? 0
    if (templatesToUpdate > 0) {
      await supabase
        .from('templates')
        .update({ fandom: keeper.short_id, updated_at: new Date().toISOString() })
        .in('fandom', removeShortIds)
    }

    // Delete duplicate fandoms (characters already reassigned)
    await supabase.from('fandoms').delete().in('id', removeIds)

    merged.push({
      kept: keeper.short_id,
      removed: removeShortIds,
      charactersMoved,
      assetsUpdated: assetsToUpdate,
      templatesUpdated: templatesToUpdate,
    })
  }

  const message =
    merged.length === 0
      ? 'No duplicate fandoms found. All fandoms have unique normalized names.'
      : `Merged ${merged.length} group(s). Kept: ${merged.map((m) => m.kept).join(', ')}; removed: ${merged.flatMap((m) => m.removed).join(', ')}.`

  return { merged, message }
}
