/**
 * POST /catalog  { tmdbId, mediaType, language?, country? }
 *
 * Fetches a title from TMDB, caches it, and returns OUR internal id.
 *
 * This exists because the titles tables are deliberately not writable by
 * clients — RLS grants them SELECT only. Anything that needs a title row
 * (logging a film, adding to a watchlist, building a swipe deck) comes
 * through here, so the cache has exactly one door and every row carries a
 * truthful fetched_at for the six-month purge.
 *
 * Requires a valid session: deployed WITH jwt verification.
 *
 * Deploy: supabase functions deploy catalog
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const TMDB_KEY = Deno.env.get('TMDB_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const TMDB_LOCALE: Record<string, string> = {
  en: 'en-US',
  da: 'da-DK',
  es: 'es-ES',
}

// supabase-js attaches x-client-info and apikey on every call; both must be
// allowed or the browser's preflight fails before the request is sent.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  language?: 'en' | 'da' | 'es'
  country?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!TMDB_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'Server is missing TMDB_API_KEY or Supabase credentials' }, 500)
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { tmdbId, mediaType } = body
  if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) {
    return json({ error: 'tmdbId and mediaType ("movie" | "tv") are required' }, 400)
  }

  const language = body.language && TMDB_LOCALE[body.language] ? body.language : 'en'
  const locale = TMDB_LOCALE[language]
  const country = (body.country ?? 'DK').toUpperCase()

  // One TMDB call for everything we cache.
  const extras =
    mediaType === 'movie'
      ? 'credits,videos,release_dates,watch/providers,keywords,external_ids'
      : 'credits,videos,content_ratings,watch/providers,keywords,external_ids'

  const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}`)
  url.searchParams.set('api_key', TMDB_KEY)
  url.searchParams.set('language', locale)
  url.searchParams.set('append_to_response', extras)

  const res = await fetch(url)
  if (!res.ok) return json({ error: `TMDB returned ${res.status}` }, res.status)
  const t = await res.json()

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const year = Number(String(t.release_date ?? t.first_air_date ?? '').slice(0, 4)) || null

  // Movies credit a Director in the crew; series carry created_by instead.
  const director =
    mediaType === 'movie'
      ? (t.credits?.crew ?? []).find((c: Record<string, unknown>) => c.job === 'Director')?.name ??
        null
      : (t.created_by ?? [])[0]?.name ?? null

  const trailer =
    (t.videos?.results ?? []).find(
      (v: Record<string, unknown>) => v.site === 'YouTube' && v.type === 'Trailer' && v.official,
    ) ??
    (t.videos?.results ?? []).find(
      (v: Record<string, unknown>) => v.site === 'YouTube' && v.type === 'Trailer',
    ) ??
    (t.videos?.results ?? []).find((v: Record<string, unknown>) => v.site === 'YouTube')

  // Writers are credited under several job titles; department is the reliable
  // grouping. Dedupe because one person often holds two of them.
  const writers = [
    ...new Set(
      (t.credits?.crew ?? [])
        .filter((c: Record<string, unknown>) => c.department === 'Writing')
        .map((c: Record<string, string>) => c.name),
    ),
  ].slice(0, 6)

  const castTop = (t.credits?.cast ?? []).slice(0, 12).map((c: Record<string, unknown>) => ({
    name: c.name,
    character: c.character || null,
    profilePath: c.profile_path ?? null,
  }))

  // TMDB splits keywords by media type: movies use .keywords, series .results.
  const keywords = (t.keywords?.keywords ?? t.keywords?.results ?? [])
    .map((k: Record<string, string>) => k.name)
    .slice(0, 12)

  const { data: title, error: titleErr } = await admin
    .from('titles')
    .upsert(
      {
        tmdb_id: tmdbId,
        media_type: mediaType,
        year,
        poster_path: t.poster_path ?? null,
        backdrop_path: t.backdrop_path ?? null,
        runtime_minutes: mediaType === 'movie' ? (t.runtime ?? null) : null,
        seasons: mediaType === 'tv' ? (t.number_of_seasons ?? null) : null,
        genres: (t.genres ?? []).map((g: { name: string }) => g.name),
        director,
        writers,
        cast_top: castTop,
        keywords,
        tagline: t.tagline || null,
        tmdb_rating: t.vote_average ? Number(t.vote_average).toFixed(1) : null,
        tmdb_votes: t.vote_count ?? null,
        trailer_key: trailer?.key ?? null,
        imdb_id: t.imdb_id ?? t.external_ids?.imdb_id ?? null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'tmdb_id,media_type' },
    )
    .select('id')
    .single()

  if (titleErr) return json({ error: titleErr.message }, 500)
  const titleId = title.id

  // Localised name and overview — TMDB's own translation, never ours.
  await admin.from('title_translations').upsert(
    {
      title_id: titleId,
      language,
      name: t.title ?? t.name,
      overview: t.overview || null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'title_id,language' },
  )

  const certification = extractCertification(t, mediaType, country)
  if (certification) {
    await admin
      .from('title_certifications')
      .upsert({ title_id: titleId, country, certification }, { onConflict: 'title_id,country' })
  }

  const providers = extractProviders(t, country, titleId)
  if (providers.length) {
    await admin
      .from('title_providers')
      .upsert(providers, { onConflict: 'title_id,country,provider_id,offer_type' })
  }

  return json({
    id: titleId,
    tmdbId,
    mediaType,
    name: t.title ?? t.name,
    year,
    posterUrl: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
    runtimeMinutes: mediaType === 'movie' ? (t.runtime ?? null) : null,
    seasons: mediaType === 'tv' ? (t.number_of_seasons ?? null) : null,
    genres: (t.genres ?? []).map((g: { name: string }) => g.name),
    director,
    writers,
    castTop,
    keywords,
    tagline: t.tagline || null,
    tmdbRating: t.vote_average ? Number(Number(t.vote_average).toFixed(1)) : null,
    tmdbVotes: t.vote_count ?? null,
    certification,
    trailerKey: trailer?.key ?? null,
    overview: t.overview || null,
    providers,
  })
})

function extractCertification(
  t: Record<string, any>,
  mediaType: 'movie' | 'tv',
  country: string,
): string | null {
  if (mediaType === 'movie') {
    const entry = (t.release_dates?.results ?? []).find(
      (r: Record<string, unknown>) => r.iso_3166_1 === country,
    )
    const found = (entry?.release_dates ?? []).find(
      (d: Record<string, unknown>) => typeof d.certification === 'string' && d.certification !== '',
    )
    return found?.certification ?? null
  }

  const entry = (t.content_ratings?.results ?? []).find(
    (r: Record<string, unknown>) => r.iso_3166_1 === country,
  )
  return entry?.rating || null
}

/**
 * Watch providers come from TMDB but originate with JustWatch, who require
 * attribution wherever this is shown. TMDB does not expose deep links, only
 * which services carry the title.
 */
function extractProviders(t: Record<string, any>, country: string, titleId: number) {
  const forCountry = t['watch/providers']?.results?.[country]
  if (!forCountry) return []

  const kinds = ['flatrate', 'rent', 'buy', 'ads', 'free'] as const
  const rows: Array<Record<string, unknown>> = []
  const now = new Date().toISOString()

  for (const kind of kinds) {
    for (const p of forCountry[kind] ?? []) {
      rows.push({
        title_id: titleId,
        country,
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path ?? null,
        offer_type: kind,
        fetched_at: now,
      })
    }
  }
  return rows
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
