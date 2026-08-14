/**
 * GET /tmdb?path=<tmdb path>&<any tmdb params>
 *
 * A thin pass-through to the TMDB API that keeps TMDB_API_KEY on the server.
 * The browser never sees the key — this is why the app cannot call TMDB
 * directly from the frontend.
 *
 * Example: /tmdb?path=movie/550&language=da-DK
 *
 * Deploy:  supabase functions deploy tmdb
 * Secrets: supabase secrets set TMDB_API_KEY=...
 */

const TMDB_KEY = Deno.env.get('TMDB_API_KEY')

/** Only these prefixes may be proxied, so the function cannot be used as an open relay. */
const ALLOWED = [
  'search/',
  'movie/',
  'tv/',
  'person/',
  'discover/',
  'genre/',
  'trending/',
  'watch/providers',
  'configuration',
]

// supabase-js attaches x-client-info and apikey on every call; both must be
// allowed or the browser's preflight fails before the request is sent.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!TMDB_KEY) return json({ error: 'Server is missing TMDB_API_KEY' }, 500)

  const incoming = new URL(req.url)
  const path = incoming.searchParams.get('path')

  if (!path) return json({ error: 'Missing ?path=' }, 400)
  if (!ALLOWED.some((p) => path.startsWith(p))) {
    return json({ error: `Path not allowed: ${path}` }, 403)
  }

  const target = new URL(`https://api.themoviedb.org/3/${path}`)
  for (const [key, value] of incoming.searchParams) {
    if (key !== 'path') target.searchParams.set(key, value)
  }
  target.searchParams.set('api_key', TMDB_KEY)

  const res = await fetch(target)
  const body = await res.text()

  return new Response(body, {
    status: res.status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      // TMDB forbids caching their data for more than 6 months; an hour at the
      // edge keeps us well inside that and cuts our rate-limit usage.
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
