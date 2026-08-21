import { supabase } from '@/lib/supabase'

export interface Watchlist {
  id: string
  name: string
  description: string | null
  ownerId: string
  groupId: string | null
  groupName: string | null
  itemCount: number
}

export interface WatchlistItem {
  titleId: number
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterUrl: string | null
  addedBy: string | null
  runtimeMinutes: number | null
  genres: string[]
  /** Subscription services carrying it in the viewer's country. */
  services: string[]
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342'

/**
 * Every list the user can see: their own, ones shared with them directly, and
 * ones belonging to their groups. RLS decides which rows come back — this
 * query does not filter by owner, and deliberately so.
 */
export async function getMyWatchlists(): Promise<Watchlist[]> {
  const { data, error } = await supabase
    .from('watchlists')
    .select('id, name, description, owner_id, group_id, group:groups(name), items:watchlist_items(count)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    groupId: row.group_id,
    groupName: row.group?.name ?? null,
    itemCount: row.items?.[0]?.count ?? 0,
  }))
}

export async function createWatchlist(
  name: string,
  description: string | null,
  groupId: string | null,
): Promise<string> {
  // owner_id defaults to auth.uid().
  const { data, error } = await supabase
    .from('watchlists')
    .insert({ name, description, group_id: groupId })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

export async function deleteWatchlist(id: string): Promise<void> {
  const { error } = await supabase.from('watchlists').delete().eq('id', id)
  if (error) throw error
}

export interface WatchlistMember {
  userId: string
  username: string
  role: 'editor' | 'viewer'
}

/**
 * Shares an existing list with a group, or unshares it by passing null.
 *
 * A list's audience is not a decision anyone can make correctly at the moment
 * they create it, so it stays changeable. Owner-only, enforced by RLS.
 */
export async function setWatchlistGroup(id: string, groupId: string | null): Promise<void> {
  const { error } = await supabase.from('watchlists').update({ group_id: groupId }).eq('id', id)
  if (error) throw error
}

export async function getWatchlistMembers(watchlistId: string): Promise<WatchlistMember[]> {
  const { data, error } = await supabase
    .from('watchlist_members')
    .select('user_id, role, profile:profiles!inner(username)')
    .eq('watchlist_id', watchlistId)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    userId: row.user_id,
    username: row.profile.username,
    role: row.role,
  }))
}

/** Shares a list with one person by username, without involving a group. */
export async function addWatchlistMember(watchlistId: string, username: string): Promise<void> {
  const { data: profile, error: lookupErr } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username.trim())
    .maybeSingle()

  if (lookupErr) throw lookupErr
  if (!profile) throw new Error(`No member called "${username.trim()}"`)

  const { error } = await supabase
    .from('watchlist_members')
    .insert({ watchlist_id: watchlistId, user_id: profile.id, role: 'editor' })

  // Already shared with them, which is the goal.
  if (error && error.code !== '23505') throw error
}

export async function removeWatchlistMember(watchlistId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('watchlist_members')
    .delete()
    .eq('watchlist_id', watchlistId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function getWatchlistItems(
  watchlistId: string,
  language: string,
  country = 'DK',
): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select(
      'added_by, title:titles!inner(id, tmdb_id, media_type, year, poster_path, runtime_minutes, genres, ' +
        'translations:title_translations(name, language))',
    )
    .eq('watchlist_id', watchlistId)
    .order('added_at', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as Array<Record<string, any>>
  const titleIds = rows.map((r) => r.title.id)

  // One query for the whole list rather than one per title — a list of thirty
  // would otherwise be thirty round trips to render a filter bar.
  const services = new Map<number, string[]>()
  if (titleIds.length) {
    const { data: provs } = await supabase
      .from('title_providers')
      .select('title_id, provider_name')
      .in('title_id', titleIds)
      .eq('country', country)
      .eq('offer_type', 'flatrate')

    for (const p of (provs ?? []) as Array<Record<string, any>>) {
      const list = services.get(p.title_id) ?? []
      if (!list.includes(p.provider_name)) list.push(p.provider_name)
      services.set(p.title_id, list)
    }
  }

  return rows.map((row) => {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name ??
      '—'

    return {
      titleId: row.title.id,
      tmdbId: row.title.tmdb_id,
      mediaType: row.title.media_type,
      name,
      year: row.title.year,
      posterUrl: row.title.poster_path ? `${POSTER_BASE}${row.title.poster_path}` : null,
      addedBy: row.added_by,
      runtimeMinutes: row.title.runtime_minutes,
      genres: row.title.genres ?? [],
      services: services.get(row.title.id) ?? [],
    }
  })
}

/** A title you have saved somewhere, for the shortcuts on the log screen. */
export interface SavedTitle {
  titleId: number
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterUrl: string | null
}

/**
 * Everything on any list you can read, newest first.
 *
 * Not per-list: this answers "what have I already said I want to watch",
 * which is the likeliest thing someone is about to log, and which list it
 * happens to sit on does not matter for that. RLS decides what counts as a
 * list you can read, so a group list you were added to is in here too.
 */
export async function getSavedTitles(language: string, limit = 12): Promise<SavedTitle[]> {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select(
      'title:titles!inner(id, tmdb_id, media_type, year, poster_path, ' +
        'translations:title_translations(name, language))',
    )
    .order('added_at', { ascending: false })
    .limit(limit * 3)

  if (error) {
    console.error('Could not read saved titles', error)
    return []
  }

  // The same film can sit on several lists; it should appear once.
  const seen = new Set<number>()
  const out: SavedTitle[] = []
  for (const row of (data ?? []) as Array<Record<string, any>>) {
    if (out.length >= limit || seen.has(row.title.id)) continue
    seen.add(row.title.id)

    const translations = row.title?.translations ?? []
    out.push({
      titleId: row.title.id,
      tmdbId: row.title.tmdb_id,
      mediaType: row.title.media_type,
      name:
        translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
        translations[0]?.name ??
        '—',
      year: row.title.year,
      posterUrl: row.title.poster_path ? `${POSTER_BASE}${row.title.poster_path}` : null,
    })
  }
  return out
}

/**
 * The title must already be catalogued — call catalogTitle first.
 *
 * Plain insert rather than upsert: PostgREST does not apply column DEFAULTs on
 * the upsert path, so `added_by DEFAULT auth.uid()` would have arrived NULL and
 * quietly lost track of who added what. Adding the same title twice is a no-op,
 * not an error.
 */
export async function addToWatchlist(watchlistId: string, titleId: number): Promise<void> {
  const { error } = await supabase
    .from('watchlist_items')
    .insert({ watchlist_id: watchlistId, title_id: titleId })

  // 23505 = unique_violation: it is already on the list, which is the goal.
  if (error && error.code !== '23505') throw error
}

export async function removeFromWatchlist(watchlistId: string, titleId: number): Promise<void> {
  const { error } = await supabase
    .from('watchlist_items')
    .delete()
    .eq('watchlist_id', watchlistId)
    .eq('title_id', titleId)

  if (error) throw error
}
