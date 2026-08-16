import { supabase } from '@/lib/supabase'

/** 'more' = show me more like this. 'less' = never offer this again. */
export type Verdict = 'more' | 'less'

export interface FeedbackEntry {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  verdict: Verdict
}

/**
 * Steering the wall, deliberately separate from the watch log.
 *
 * Pressing "more like this" is not the same as rating something — it is about
 * films the user has usually not seen. Keeping them apart is what stops the
 * log filling up with viewings that never happened.
 */
export async function getMyFeedback(): Promise<FeedbackEntry[]> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select('tmdb_id, media_type, name, year, verdict')

  if (error) {
    // Not fatal: the wall works without it, just less well steered.
    console.error('Could not read recommendation feedback', error)
    return []
  }

  return ((data ?? []) as Array<Record<string, any>>).map((r) => ({
    tmdbId: r.tmdb_id,
    mediaType: r.media_type,
    name: r.name,
    year: r.year,
    verdict: r.verdict,
  }))
}

/**
 * Records a verdict, or clears it when `verdict` is null.
 *
 * user_id is passed explicitly even though the column defaults to auth.uid().
 * PostgREST does NOT apply column defaults on the upsert path — that is what
 * once made watchlist inserts fail with an opaque RLS error — so on the UPDATE
 * half of this upsert the default would never fire and the row would arrive
 * with a NULL owner, failing the WITH CHECK. Naming it is the fix.
 */
export async function setFeedback(
  entry: Omit<FeedbackEntry, 'verdict'>,
  verdict: Verdict | null,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  if (verdict === null) {
    const { error } = await supabase
      .from('recommendation_feedback')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('tmdb_id', entry.tmdbId)
      .eq('media_type', entry.mediaType)

    if (error) throw error
    return
  }

  const { error } = await supabase.from('recommendation_feedback').upsert(
    {
      user_id: auth.user.id,
      tmdb_id: entry.tmdbId,
      media_type: entry.mediaType,
      name: entry.name,
      year: entry.year,
      verdict,
    },
    { onConflict: 'user_id,tmdb_id,media_type' },
  )

  if (error) throw error
}
