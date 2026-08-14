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

export async function getWatchlistItems(
  watchlistId: string,
  language: string,
): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select(
      'added_by, title:titles!inner(id, tmdb_id, media_type, year, poster_path, ' +
        'translations:title_translations(name, language))',
    )
    .eq('watchlist_id', watchlistId)
    .order('added_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => {
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
    }
  })
}

/** The title must already be catalogued — call catalogTitle first. */
export async function addToWatchlist(watchlistId: string, titleId: number): Promise<void> {
  const { error } = await supabase
    .from('watchlist_items')
    // added_by defaults to auth.uid(). Ignore a repeat add rather than erroring.
    .upsert({ watchlist_id: watchlistId, title_id: titleId }, { onConflict: 'watchlist_id,title_id' })

  if (error) throw error
}

export async function removeFromWatchlist(watchlistId: string, titleId: number): Promise<void> {
  const { error } = await supabase
    .from('watchlist_items')
    .delete()
    .eq('watchlist_id', watchlistId)
    .eq('title_id', titleId)

  if (error) throw error
}
