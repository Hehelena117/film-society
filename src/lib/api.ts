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
 * The user's own highly-rated titles, for seeding the recommender.
 *
 * Only name, year and score are read — and only these ever reach the model.
 * See docs/DECISIONS.md, "AI firewall".
 */
export async function getRatingSeeds(language: SupportedLanguage): Promise<RatingSeed[]> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('rating, title:titles!inner(year, translations:title_translations(name, language))')
    .not('rating', 'is', null)
    .order('rating', { ascending: false })
    .limit(60)

  if (error) {
    console.error('Could not read ratings', error)
    return []
  }

  const seeds: RatingSeed[] = []
  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name
    if (name && row.title?.year && row.rating) {
      seeds.push({ name, year: row.title.year, score: row.rating })
    }
  }
  return seeds
}

export async function getRecommendations(opts: {
  ratings: RatingSeed[]
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
