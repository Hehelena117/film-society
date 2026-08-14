import { supabase } from '@/lib/supabase'

export interface LogInput {
  titleId: number
  /** Whole numbers 1–10, or null to log a viewing without scoring it. */
  rating: number | null
  /** Private — never leaves the owner. */
  watchedOn: string | null
  /** For series. We track seasons, never episodes. */
  seasonNumber: number | null
  /** Private — stored in its own table so it can never ride along with a rating. */
  note: string | null
}

/**
 * Records a viewing.
 *
 * Deliberately an insert, never an upsert: logging the same film twice is a
 * rewatch, not a correction, and each pass keeps its own date and rating.
 */
export async function logViewing(input: LogInput): Promise<string> {
  const { data, error } = await supabase
    .from('log_entries')
    .insert({
      title_id: input.titleId,
      rating: input.rating,
      watched_on: input.watchedOn,
      season_number: input.seasonNumber,
    })
    .select('id')
    .single()

  if (error) throw error
  const entryId = data.id as string

  if (input.note?.trim()) {
    // user_id is omitted deliberately: it defaults to auth.uid(), and a trigger
    // then overwrites it with the parent entry's owner — so a note cannot be
    // attached to someone else's entry however it is called.
    const { error: noteErr } = await supabase
      .from('entry_notes')
      .insert({ entry_id: entryId, body: input.note.trim() })

    if (noteErr) {
      // The entry itself is saved; surface the note failure rather than
      // pretending the whole thing worked.
      throw new Error(`Saved the entry, but the note failed: ${noteErr.message}`)
    }
  }

  return entryId
}

export interface LoggedEntry {
  id: string
  rating: number | null
  watchedOn: string | null
  seasonNumber: number | null
  createdAt: string
  title: {
    id: number
    posterPath: string | null
    year: number | null
    mediaType: 'movie' | 'tv'
    name: string
  }
}

/** The signed-in user's own log. Owner-only by RLS — this returns nothing for anyone else. */
export async function getMyLog(language: string, limit = 50): Promise<LoggedEntry[]> {
  const { data, error } = await supabase
    .from('log_entries')
    .select(
      'id, rating, watched_on, season_number, created_at, ' +
        'title:titles!inner(id, poster_path, year, media_type, translations:title_translations(name, language))',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name ??
      '—'

    return {
      id: row.id,
      rating: row.rating,
      watchedOn: row.watched_on,
      seasonNumber: row.season_number,
      createdAt: row.created_at,
      title: {
        id: row.title.id,
        posterPath: row.title.poster_path,
        year: row.title.year,
        mediaType: row.title.media_type,
        name,
      },
    }
  })
}
