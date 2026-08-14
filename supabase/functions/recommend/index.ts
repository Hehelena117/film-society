/**
 * POST /recommend
 *
 * Returns the next page of the user's recommendation wall.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AI FIREWALL — read docs/DECISIONS.md before changing this file.
 *
 * TMDB's terms prohibit using their API "in connection with" an AI application.
 * Our mitigation is that TMDB content NEVER reaches the model. The model sees
 * only the user's own ratings and their own filter choices, and answers from
 * its own knowledge of cinema. TMDB is then used purely to resolve the returned
 * titles into posters and metadata for DISPLAY.
 *
 * If you find yourself putting a TMDB `overview`, `keywords`, `credits`, or
 * `poster_path` into `messages`, stop — that breaks the firewall.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Deploy:  supabase functions deploy recommend
 * Secrets: supabase secrets set OPENROUTER_API_KEY=... TMDB_API_KEY=...
 */

const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY')
const TMDB_KEY = Deno.env.get('TMDB_API_KEY')
const MODEL = 'anthropic/claude-haiku-4.5'

/** A rating the user typed. Not TMDB content. */
interface UserRating {
  name: string
  year: number
  score: number // 1–10
}

interface RecommendRequest {
  ratings: UserRating[]
  excludeNames: string[]
  filters: { genres?: string[]; services?: string[] }
  language: 'en' | 'da' | 'es'
  count?: number
}

const TMDB_LOCALE: Record<string, string> = {
  en: 'en-US',
  da: 'da-DK',
  es: 'es-ES',
}

// supabase-js attaches x-client-info and apikey on every call. Omitting them
// here fails the browser's preflight, and the error surfaces as the opaque
// "Failed to send a request to the Edge Function" — no status, no body,
// because the request never leaves the browser.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!OPENROUTER_KEY || !TMDB_KEY) {
    return json({ error: 'Server is missing OPENROUTER_API_KEY or TMDB_API_KEY' }, 500)
  }

  let body: RecommendRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const count = Math.min(body.count ?? 6, 12)
  const language = TMDB_LOCALE[body.language] ? body.language : 'en'

  // ---- 1. Ask the model. Only user-authored data crosses this line. --------
  const suggestions = await askModel(body, count)
  if (!suggestions.length) return json({ recommendations: [] })

  // ---- 2. Resolve to TMDB for display only. -------------------------------
  const resolved = await Promise.all(
    suggestions.map(async (s) => {
      const title = await resolveOnTmdb(s.name, s.year, TMDB_LOCALE[language])
      return title ? { title, reason: s.reason } : null
    }),
  )

  return json({ recommendations: resolved.filter(Boolean) })
})

/**
 * Sends ONLY the user's own ratings and filters. No TMDB content.
 */
async function askModel(
  body: RecommendRequest,
  count: number,
): Promise<Array<{ name: string; year: number; reason: string }>> {
  const liked = body.ratings
    .filter((r) => r.score >= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((r) => `${r.name} (${r.year}) — rated ${r.score}/10`)
    .join('\n')

  const filters = [
    body.filters.genres?.length ? `Genres: ${body.filters.genres.join(', ')}` : null,
    body.filters.services?.length ? `Available on: ${body.filters.services.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = [
    `A user rated these films and series highly:`,
    liked || '(no ratings yet — suggest widely admired films)',
    filters ? `\nThey want:\n${filters}` : '',
    body.excludeNames.length ? `\nDo not suggest: ${body.excludeNames.join(', ')}` : '',
    `\nSuggest ${count} titles they have not listed. For each, give a one-sentence`,
    `reason that refers to their actual ratings where possible.`,
    `Reply as JSON only: {"suggestions":[{"name":"","year":0,"reason":""}]}`,
  ].join('\n')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    }),
  })

  if (!res.ok) {
    console.error('OpenRouter error', res.status, await res.text())
    return []
  }

  try {
    const data = await res.json()
    const parsed = JSON.parse(data.choices[0].message.content)
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  } catch (err) {
    console.error('Could not parse model output', err)
    return []
  }
}

/** Looks a title up on TMDB purely to get artwork and metadata for display. */
async function resolveOnTmdb(name: string, year: number, locale: string) {
  const url = new URL('https://api.themoviedb.org/3/search/multi')
  url.searchParams.set('api_key', TMDB_KEY!)
  url.searchParams.set('query', name)
  url.searchParams.set('language', locale)

  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  const candidates = (data.results ?? []).filter(
    (r: Record<string, unknown>) => r.media_type === 'movie' || r.media_type === 'tv',
  )
  if (!candidates.length) return null

  const yearOf = (r: Record<string, unknown>) =>
    Number(String(r.release_date ?? r.first_air_date ?? '').slice(0, 4)) || 0

  // Match the year loosely. TMDB dates are region-specific and a festival run
  // can precede general release by a year, so demanding an exact match drops
  // titles that were resolved perfectly well otherwise. Fall back to TMDB's
  // own relevance ranking rather than returning nothing.
  const hit =
    candidates.find((r: Record<string, unknown>) => yearOf(r) === year) ??
    candidates.find((r: Record<string, unknown>) => Math.abs(yearOf(r) - year) <= 1) ??
    candidates[0]

  return {
    tmdbId: hit.id,
    mediaType: hit.media_type,
    name: hit.title ?? hit.name,
    year: yearOf(hit) || year,
    posterUrl: hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null,
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
