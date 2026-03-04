import { NextResponse } from 'next/server'
import { mergeDuplicateFandoms } from '@/lib/fandomsSync'

/**
 * POST /api/fandoms/merge-duplicates
 * Finds fandoms that normalize to the same key (e.g. "Honkai Starrail", "Honkaistarrail", "Hsr"),
 * keeps one per group, merges aliases, moves characters, updates assets/templates, deletes duplicates.
 */
export async function POST() {
  try {
    const { merged, message } = await mergeDuplicateFandoms()
    return NextResponse.json({ merged, message })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Merge failed' },
      { status: 500 }
    )
  }
}
