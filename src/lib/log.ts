import { announce } from '@/lib/activity'
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

  // Tell the groups, if the viewing was scored. An unrated entry is usually
  // bookkeeping rather than an opinion, and not worth announcing.
  if (input.rating !== null) {
    await announce({ kind: 'rated', titleId: input.titleId, rating: input.rating })
  }

  return entryId
}

export interface LoggedEntry {
  id: string
  rating: number | null
  watchedOn: string | null
  seasonNumber: number | null
  createdAt: string
  /** Only ever populated for the owner — entry_notes has no public read path. */
  note: string | null
  title: {
    id: number
    tmdbId: number
    posterUrl: string | null
    year: number | null
    mediaType: 'movie' | 'tv'
    name: string
  }
}

/** The signed-in user's own log. Owner-only by RLS — returns nothing for anyone else. */
export async function getMyLog(language: string, limit = 100): Promise<LoggedEntry[]> {
  const { data, error } = await supabase
    .from('log_entries')
    .select(
      'id, rating, watched_on, season_number, created_at, note:entry_notes(body), ' +
        'title:titles!inner(id, tmdb_id, poster_path, year, media_type, translations:title_translations(name, language))',
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

    // entry_notes is one-to-one, but PostgREST embeds it as an array.
    const note = Array.isArray(row.note) ? (row.note[0]?.body ?? null) : (row.note?.body ?? null)

    return {
      id: row.id,
      rating: row.rating,
      watchedOn: row.watched_on,
      seasonNumber: row.season_number,
      createdAt: row.created_at,
      note,
      title: {
        id: row.title.id,
        tmdbId: row.title.tmdb_id,
        posterUrl: row.title.poster_path
          ? `https://image.tmdb.org/t/p/w342${row.title.poster_path}`
          : null,
        year: row.title.year,
        mediaType: row.title.media_type,
        name,
      },
    }
  })
}

export interface PriorEntry {
  id: string
  rating: number | null
  watchedOn: string | null
  seasonNumber: number | null
  createdAt: string
  note: string | null
}

/**
 * What you have already logged for one title.
 *
 * Rewatches are the point of the log, but logging something twice by accident
 * is not — so the rating form says what is already there before you add to it.
 */
export async function getMyEntriesForTitle(titleId: number): Promise<PriorEntry[]> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('id, rating, watched_on, season_number, created_at, note:entry_notes(body)')
    .eq('title_id', titleId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    rating: row.rating,
    watchedOn: row.watched_on,
    seasonNumber: row.season_number,
    createdAt: row.created_at,
    note: Array.isArray(row.note) ? (row.note[0]?.body ?? null) : (row.note?.body ?? null),
  }))
}

export interface PeerRating {
  userId: string
  username: string
  rating: number
}

/**
 * What people in your groups made of a title.
 *
 * Read through public_ratings, so it can only ever surface a score — never a
 * date, never a note. Two queries rather than a join: public_ratings is a view
 * and has no foreign key for PostgREST to embed profiles through.
 */
export async function getPeerRatings(titleId: number): Promise<PeerRating[]> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) return []

  const { data: mine } = await supabase.from('group_members').select('group_id').eq('user_id', me)
  const groupIds = (mine ?? []).map((g: Record<string, any>) => g.group_id)
  if (!groupIds.length) return []

  const { data: peers } = await supabase
    .from('group_members')
    .select('user_id')
    .in('group_id', groupIds)

  const peerIds = [...new Set((peers ?? []).map((p: Record<string, any>) => p.user_id))].filter(
    (id) => id !== me,
  )
  if (!peerIds.length) return []

  const { data: ratings, error } = await supabase
    .from('public_ratings')
    .select('user_id, rating')
    .eq('title_id', titleId)
    .in('user_id', peerIds)

  if (error) throw error
  if (!ratings?.length) return []

  const { data: names } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', ratings.map((r: Record<string, any>) => r.user_id))

  const byId = new Map((names ?? []).map((n: Record<string, any>) => [n.id, n.username]))

  return (ratings as Array<Record<string, any>>)
    .map((r) => ({ userId: r.user_id, username: byId.get(r.user_id) ?? '—', rating: r.rating }))
    .sort((a, b) => b.rating - a.rating)
}

/** Removes a logged viewing. The note cascades with it. */
export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('log_entries').delete().eq('id', id)
  if (error) throw error
}
