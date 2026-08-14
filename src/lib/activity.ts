import { supabase } from '@/lib/supabase'

export type ActivityKind = 'rated' | 'watched' | 'added_to_list' | 'joined_group' | 'decided'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  actorId: string
  actorName: string
  rating: number | null
  createdAt: string
  title: {
    tmdbId: number
    mediaType: 'movie' | 'tv'
    name: string
    posterUrl: string | null
  } | null
  watchlistName: string | null
}

const POSTER = 'https://image.tmdb.org/t/p/w185'

/** The feed for one group. There is no global feed — see docs/DECISIONS.md. */
export async function getGroupActivity(
  groupId: string,
  language: string,
  limit = 40,
): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activity')
    .select(
      'id, kind, actor_id, rating, created_at, ' +
        'actor:profiles!inner(username), ' +
        'watchlist:watchlists(name), ' +
        'title:titles(tmdb_id, media_type, poster_path, translations:title_translations(name, language))',
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name ??
      null

    return {
      id: row.id,
      kind: row.kind,
      actorId: row.actor_id,
      actorName: row.actor?.username ?? '—',
      rating: row.rating,
      createdAt: row.created_at,
      title: row.title
        ? {
            tmdbId: row.title.tmdb_id,
            mediaType: row.title.media_type,
            name: name ?? '—',
            posterUrl: row.title.poster_path ? `${POSTER}${row.title.poster_path}` : null,
          }
        : null,
      watchlistName: row.watchlist?.name ?? null,
    }
  })
}

/**
 * Announces something to every group the user belongs to.
 *
 * Deliberately best-effort: a feed entry is never worth failing the action it
 * describes. If posting fails, the rating is still saved and the user is none
 * the wiser — which is the right trade for a nicety.
 */
export async function announce(entry: {
  kind: ActivityKind
  titleId?: number | null
  watchlistId?: string | null
  rating?: number | null
}): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return

    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', auth.user.id)

    if (!memberships?.length) return

    await supabase.from('activity').insert(
      memberships.map((m: Record<string, any>) => ({
        group_id: m.group_id,
        kind: entry.kind,
        title_id: entry.titleId ?? null,
        watchlist_id: entry.watchlistId ?? null,
        rating: entry.rating ?? null,
      })),
    )
  } catch (err) {
    console.error('Could not post activity', err)
  }
}

/** Announces to one group only — for things that happened inside it. */
export async function announceToGroup(
  groupId: string,
  entry: { kind: ActivityKind; titleId?: number | null; watchlistId?: string | null },
): Promise<void> {
  try {
    await supabase.from('activity').insert({
      group_id: groupId,
      kind: entry.kind,
      title_id: entry.titleId ?? null,
      watchlist_id: entry.watchlistId ?? null,
    })
  } catch (err) {
    console.error('Could not post activity', err)
  }
}
