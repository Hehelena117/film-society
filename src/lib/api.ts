import { supabase } from '@/lib/supabase'
import type { SupportedLanguage } from '@/lib/i18n'
import { TMDB_LOCALE } from '@/lib/i18n'

export interface CastMember {
  name: string
  character: string | null
  profilePath: string | null
}

/**
 * Where a title can be watched, per TMDB — who source it from JustWatch, who
 * must be credited wherever it is shown. TMDB does not expose deep links, only
 * which services carry it.
 */
export interface Provider {
  provider_name: string
  logo_path: string | null
  offer_type: 'flatrate' | 'rent' | 'buy' | 'ads' | 'free'
}

/** A title as the catalog function returns it, already cached in our database. */
export interface CatalogedTitle {
  id: number
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterUrl: string | null
  runtimeMinutes: number | null
  seasons: number | null
  genres: string[]
  director: string | null
  writers: string[]
  castTop: CastMember[]
  /** TMDB keywords, shown as themes. */
  keywords: string[]
  tagline: string | null
  tmdbRating: number | null
  tmdbVotes: number | null
  certification: string | null
  trailerKey: string | null
  overview: string | null
  providers: Provider[]
}

export interface SearchHit {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterUrl: string | null
}

/** One of the user's own ratings, shaped for the recommender. */
export interface RatingSeed {
  name: string
  year: number
  score: number
}

export interface RecommendedTitle {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number
  posterUrl: string | null
}

export interface ApiRecommendation {
  title: RecommendedTitle
  reason: string
}

/** Searches TMDB through our proxy, so the API key stays on the server. */
export async function searchTitles(
  query: string,
  language: SupportedLanguage,
): Promise<SearchHit[]> {
  if (!query.trim()) return []

  const params = new URLSearchParams({
    path: 'search/multi',
    query,
    language: TMDB_LOCALE[language],
  })

  const { data, error } = await supabase.functions.invoke(`tmdb?${params}`, { method: 'GET' })
  if (error) throw error

  return (data.results ?? [])
    .filter((r: Record<string, unknown>) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r: Record<string, any>) => ({
      tmdbId: r.id,
      mediaType: r.media_type,
      name: r.title ?? r.name,
      year: Number(String(r.release_date ?? r.first_air_date ?? '').slice(0, 4)) || null,
      posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
    }))
}

/**
 * Caches a title in our database and returns its internal id.
 *
 * Clients cannot write to the titles tables directly — RLS grants SELECT only —
 * so anything that needs a title row goes through this one door.
 */
export async function catalogTitle(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  language: SupportedLanguage,
  country: string,
): Promise<CatalogedTitle> {
  const { data, error } = await supabase.functions.invoke<CatalogedTitle>('catalog', {
    body: { tmdbId, mediaType, language, country },
  })
  if (error) throw error
  if (!data) throw new Error('catalog returned nothing')
  return data
}

/**
 * A note the user wrote, shaped for the recommender.
 *
 * Only ever built when profiles.use_notes_for_recommendations is true.
 */
export interface NoteSeed {
  name: string
  year: number | null
  /** A note on an unrated entry is still an opinion, so the score is optional. */
  score: number | null
  body: string
}

export interface LogSnapshot {
  /** Every scored title, high and low. Low scores are signal too. */
  ratings: RatingSeed[]
  /** Everything logged at all, scored or not — never recommend these back. */
  loggedNames: string[]
  /** Empty unless the user has opted in. */
  notes: NoteSeed[]
}

/**
 * How many notes, and how much of each, may go to the model.
 *
 * A note may be 4000 characters. Thirty of those would be most of the prompt
 * and would drown the ratings, so the newest few are sent and each is trimmed
 * to its opening — which is where people say what they thought, before they
 * start recounting the plot.
 */
const MAX_NOTES = 30
const MAX_NOTE_CHARS = 400

/**
 * The user's own log, for seeding the recommender.
 *
 * Reads every entry, not just the well-liked ones. Sending only scores of 7+
 * meant rating something 5 changed the input not at all, so the wall came back
 * identical and looked broken. A low score is information — it says what to
 * steer away from — and it also guarantees the input differs after every
 * rating, which is what makes the refresh visible.
 *
 * Names, years and scores are user-authored, not TMDB content, so sending them
 * keeps the AI firewall intact. See docs/DECISIONS.md.
 *
 * `includeNotes` must come from profiles.use_notes_for_recommendations and
 * nothing else. Notes are the one thing here the user has to hand over
 * deliberately: they are unreadable by any other user, and sending them means
 * the text reaches the model provider. Default to false at every layer, so a
 * caller that forgets to ask sends nothing rather than everything.
 */
export async function getLogSnapshot(
  language: SupportedLanguage,
  includeNotes = false,
): Promise<LogSnapshot> {
  // log_entries is owner-only since 20260814000004 — this returns the caller's
  // own entries and nobody else's. entry_notes is owner-only too, so the embed
  // below cannot pick up another person's note even if the join let it try.
  const { data, error } = await supabase
    .from('log_entries')
    .select(
      'rating, title:titles!inner(year, translations:title_translations(name, language))' +
        (includeNotes ? ', note:entry_notes(body)' : ''),
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Could not read log', error)
    return { ratings: [], loggedNames: [], notes: [] }
  }

  const ratings: RatingSeed[] = []
  const notes: NoteSeed[] = []
  const loggedNames = new Set<string>()

  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name
    if (!name) continue

    loggedNames.add(name)
    if (row.rating !== null && row.title?.year) {
      ratings.push({ name, year: row.title.year, score: row.rating })
    }

    if (includeNotes && notes.length < MAX_NOTES) {
      // entry_notes is one-to-one, but PostgREST embeds it as an array.
      const body = Array.isArray(row.note) ? row.note[0]?.body : row.note?.body
      if (typeof body === 'string' && body.trim()) {
        notes.push({
          name,
          year: row.title?.year ?? null,
          score: row.rating,
          body: body.trim().slice(0, MAX_NOTE_CHARS),
        })
      }
    }
  }

  return { ratings, loggedNames: [...loggedNames], notes }
}

export async function getRecommendations(opts: {
  ratings: RatingSeed[]
  /** Only ever non-empty when the user has opted in. */
  notes?: NoteSeed[]
  /** What they pressed on the wall itself. Not ratings — see lib/feedback.ts. */
  feedback?: {
    more?: Array<{ name: string; year: number | null }>
    less?: Array<{ name: string; year: number | null }>
  }
  /** Books they loved. The one bridge between the two halves. */
  crossover?: Array<{ title: string; author: string | null; score: number }>
  excludeNames: string[]
  filters: { genres?: string[]; services?: string[] }
  language: SupportedLanguage
  count: number
}): Promise<ApiRecommendation[]> {
  const { data, error } = await supabase.functions.invoke<{
    recommendations: ApiRecommendation[]
  }>('recommend', { body: opts })

  if (error) throw error
  return data?.recommendations ?? []
}

/**
 * Your film ratings, for the BOOK side's recommender.
 *
 * The mirror of getBookRatingsForCrossover. Titles and scores only: notes are
 * opt-in per side and never cross, whichever switch happens to be on.
 */
export async function getFilmRatingsForCrossover(
  language: SupportedLanguage,
  limit = 30,
): Promise<Array<{ name: string; year: number | null; score: number }>> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('rating, title:titles!inner(year, translations:title_translations(name, language))')
    .not('rating', 'is', null)
    .gte('rating', 7)
    .order('rating', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Could not read film ratings for crossover', error)
    return []
  }

  const out: Array<{ name: string; year: number | null; score: number }> = []
  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name
    if (name) out.push({ name, year: row.title?.year ?? null, score: row.rating })
  }
  return out
}
