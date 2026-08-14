import { supabase } from '@/lib/supabase'

export interface SwipeCandidate {
  titleId: number
  name: string
  year: number | null
  posterUrl: string | null
  mediaType: 'movie' | 'tv'
  runtimeMinutes: number | null
  genres: string[]
  director: string | null
}

export interface SwipeSession {
  id: string
  groupId: string | null
  watchlistId: string | null
  status: 'open' | 'decided' | 'cancelled'
  decidedTitleId: number | null
  createdBy: string
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/w500'

/**
 * Opens a session over a watchlist.
 *
 * The deck is fixed when the session opens rather than computed per person, so
 * everyone swipes the same cards in the same order — otherwise "we both liked
 * it" would depend on who happened to be shown what.
 */
export interface DeckFilters {
  genres?: string[]
  /** Provider names as TMDB reports them, e.g. "Netflix". */
  services?: string[]
  maxMinutes?: number | null
}

/**
 * What a list could be filtered by — derived from the titles actually on it,
 * so the controls never offer a genre that would empty the deck.
 */
export async function getFilterOptions(
  watchlistId: string,
  country: string,
): Promise<{ genres: string[]; services: string[] }> {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('title:titles!inner(id, genres)')
    .eq('watchlist_id', watchlistId)

  if (error) throw error

  const rows = (data ?? []) as Array<Record<string, any>>
  const genres = [...new Set(rows.flatMap((r) => r.title?.genres ?? []))].sort()
  const titleIds = rows.map((r) => r.title.id)

  if (!titleIds.length) return { genres, services: [] }

  const { data: provs } = await supabase
    .from('title_providers')
    .select('provider_name')
    .in('title_id', titleIds)
    .eq('country', country)
    .eq('offer_type', 'flatrate')

  const services = [
    ...new Set((provs ?? []).map((p: Record<string, any>) => p.provider_name)),
  ].sort()

  return { genres, services }
}

export async function startSession(
  watchlistId: string,
  groupId: string | null,
  filters: DeckFilters = {},
  country = 'DK',
): Promise<string> {
  const { data: session, error } = await supabase
    .from('swipe_sessions')
    .insert({ watchlist_id: watchlistId, group_id: groupId, filters })
    .select('id')
    .single()

  if (error) throw error
  const sessionId = session.id as string

  // The host joins their own session.
  const { error: joinErr } = await supabase
    .from('swipe_participants')
    .insert({ session_id: sessionId })
  if (joinErr) throw joinErr

  // A session whose deck never got built is worse than no session: it sits in
  // the group's "happening now" list forever, inviting people into a room with
  // nothing in it. So anything that fails from here on cancels it on the way
  // out. There is no delete policy on swipe_sessions by design — cancelling is
  // the honest record of what happened.
  try {
    const { data: items, error: itemsErr } = await supabase
      .from('watchlist_items')
      .select('title:titles!inner(id, genres, runtime_minutes)')
      .eq('watchlist_id', watchlistId)
    if (itemsErr) throw itemsErr

    let candidates = ((items ?? []) as Array<Record<string, any>>).map((r) => r.title)

    if (filters.genres?.length) {
      candidates = candidates.filter((t) =>
        (t.genres ?? []).some((g: string) => filters.genres!.includes(g)),
      )
    }

    if (filters.maxMinutes) {
      // A series has no runtime, so a length filter cannot judge it. Keep it
      // rather than silently dropping every series from the deck.
      candidates = candidates.filter(
        (t) => t.runtime_minutes === null || t.runtime_minutes <= filters.maxMinutes!,
      )
    }

    if (filters.services?.length && candidates.length) {
      const { data: provs } = await supabase
        .from('title_providers')
        .select('title_id, provider_name')
        .in(
          'title_id',
          candidates.map((t) => t.id),
        )
        .eq('country', country)
        .eq('offer_type', 'flatrate')
        .in('provider_name', filters.services)

      const available = new Set((provs ?? []).map((p: Record<string, any>) => p.title_id))
      candidates = candidates.filter((t) => available.has(t.id))
    }

    const deck = candidates.map((t, i) => ({
      session_id: sessionId,
      title_id: t.id,
      position: i,
    }))

    // Distinguishable from an empty list: the filters were simply too narrow.
    if (!deck.length) {
      throw new Error(
        filters.genres?.length || filters.services?.length || filters.maxMinutes
          ? 'no-matches'
          : 'empty-watchlist',
      )
    }

    const { error: deckErr } = await supabase.from('swipe_candidates').insert(deck)
    if (deckErr) throw deckErr

    return sessionId
  } catch (err) {
    await supabase.from('swipe_sessions').update({ status: 'cancelled' }).eq('id', sessionId)
    throw err
  }
}

export interface OpenSession {
  id: string
  watchlistName: string | null
  participants: number
}

/** Sessions a group member can still join. */
export async function getOpenSessions(groupId: string): Promise<OpenSession[]> {
  const { data, error } = await supabase
    .from('swipe_sessions')
    .select('id, watchlist:watchlists(name), participants:swipe_participants(count)')
    .eq('group_id', groupId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    watchlistName: row.watchlist?.name ?? null,
    participants: row.participants?.[0]?.count ?? 0,
  }))
}

/** Postgres unique_violation — the row is already there, which is the goal. */
const DUPLICATE = '23505'

/**
 * Idempotent: the host is already a participant by the time they reach the
 * swipe screen, because startSession must seat them before it may build the
 * deck.
 *
 * A plain insert, not an upsert, for two reasons found the hard way:
 *
 *  - upsert takes the UPDATE path on conflict, and swipe_participants has no
 *    UPDATE policy, which surfaces as "violates row-level security policy
 *    (USING expression)". USING belongs to UPDATE — that phrase is the tell.
 *  - more importantly, the user_id DEFAULT auth.uid() is not applied on
 *    PostgREST's upsert path, so user_id arrived NULL, `NULL = auth.uid()` is
 *    NULL rather than true, and the WITH CHECK failed for anyone whose row did
 *    not already exist.
 *
 * Nobody ever needs to update a participant row, so tolerating the duplicate
 * is both simpler and truer to the intent.
 */
export async function joinSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('swipe_participants').insert({ session_id: sessionId })
  if (error && error.code !== DUPLICATE) throw error
}

export async function getSession(sessionId: string): Promise<SwipeSession | null> {
  const { data, error } = await supabase
    .from('swipe_sessions')
    .select('id, group_id, watchlist_id, status, decided_title_id, created_by')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    groupId: data.group_id,
    watchlistId: data.watchlist_id,
    status: data.status,
    decidedTitleId: data.decided_title_id,
    createdBy: data.created_by,
  }
}

export async function getCandidates(
  sessionId: string,
  language: string,
): Promise<SwipeCandidate[]> {
  const { data, error } = await supabase
    .from('swipe_candidates')
    .select(
      'position, title:titles!inner(id, poster_path, year, media_type, runtime_minutes, genres, director, ' +
        'translations:title_translations(name, language))',
    )
    .eq('session_id', sessionId)
    .order('position')

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name ??
      '—'

    return {
      titleId: row.title.id,
      name,
      year: row.title.year,
      posterUrl: row.title.poster_path ? `${POSTER_BASE}${row.title.poster_path}` : null,
      mediaType: row.title.media_type,
      runtimeMinutes: row.title.runtime_minutes,
      genres: row.title.genres ?? [],
      director: row.title.director,
    }
  })
}

/**
 * Records a swipe. The match rule — everyone must agree at two people, a
 * majority at three or more — is evaluated by a database trigger, not here, so
 * it cannot be bent by whoever swipes last.
 */
export async function swipe(sessionId: string, titleId: number, liked: boolean): Promise<void> {
  // Plain insert for the same reasons as joinSession. A vote is final anyway:
  // the match trigger fires on INSERT only, so an overwrite would never be
  // re-evaluated even if the policies allowed one.
  const { error } = await supabase
    .from('swipes')
    .insert({ session_id: sessionId, title_id: titleId, liked })
  if (error && error.code !== DUPLICATE) throw error
}

export async function getParticipantCount(sessionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('swipe_participants')
    .select('user_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  if (error) throw error
  return count ?? 0
}

/** Fires whenever the session row changes — which is how everyone learns of a match. */
export function watchSession(sessionId: string, onChange: (s: SwipeSession) => void) {
  const channel = supabase
    .channel(`session-${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'swipe_sessions', filter: `id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as Record<string, any>
        onChange({
          id: row.id,
          groupId: row.group_id,
          watchlistId: row.watchlist_id,
          status: row.status,
          decidedTitleId: row.decided_title_id,
          createdBy: row.created_by,
        })
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

/** Fires when anyone joins, so the participant count stays honest mid-session. */
export function watchParticipants(sessionId: string, onChange: () => void) {
  const channel = supabase
    .channel(`participants-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'swipe_participants',
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
