/**
 * POST /books  { olKey, language }
 *
 * Caches a book and returns its row. The single door for writing `books` and
 * `book_translations` — clients hold SELECT only, exactly as with `titles`.
 *
 * Two calls to Open Library: the search record carries the fields worth
 * showing on a shelf, and the work record carries the description, which
 * search does not return.
 *
 * Deploy: supabase functions deploy books
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

import { pickAuthor, tidyName } from '../_shared/names.ts'

const UA = 'FilmSociety/0.1 (https://github.com/Hehelena117/film-society)'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  olKey: string
  language?: 'en' | 'da' | 'es'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const olKey = String(body.olKey ?? '').replace('/works/', '').trim()
  if (!/^OL\d+W$/.test(olKey)) return json({ error: 'Not an Open Library work key' }, 400)

  const language = body.language ?? 'en'

  // Service role: this function IS the write path, and the caller's own grants
  // deliberately do not include INSERT on the cache.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Same deadline and the same reasoning as the search function: a page that
  // spins forever is worse than one that says what happened, and a non-2xx
  // reaches the reader as "Edge Function returned a non-2xx status code",
  // which names the wrong component and offers nothing to do about it.
  const deadline = AbortSignal.timeout(8000)

  let searchRes: Response
  let workRes: Response
  try {
    ;[searchRes, workRes] = await Promise.all([
      fetch(
        `https://openlibrary.org/search.json?q=key:/works/${olKey}` +
          '&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject,author_key,author_alternative_name,series_name,series_position,ratings_average,ratings_count&limit=1',
        { headers: { 'User-Agent': UA }, signal: deadline },
      ),
      fetch(`https://openlibrary.org/works/${olKey}.json`, {
        headers: { 'User-Agent': UA },
        signal: deadline,
      }),
    ])
  } catch (err) {
    console.error('Open Library timed out or failed', err)
    return json({ unavailable: true })
  }

  if (!searchRes.ok && !workRes.ok) return json({ unavailable: true })

  const doc = searchRes.ok ? ((await searchRes.json()).docs?.[0] ?? {}) : {}
  const work = workRes.ok ? await workRes.json() : {}

  // Open Library stores description as either a string or {type, value},
  // depending on how old the record is.
  const description =
    typeof work.description === 'string' ? work.description : (work.description?.value ?? null)

  const title = doc.title ?? work.title
  if (!title) return json({ error: 'No such book' }, 404)

  const row = {
    ol_key: olKey,
    title,
    authors: (() => {
      const picked = pickAuthor(doc, [doc])
      return picked ? [tidyName(picked)] : (doc.author_name ?? [])
    })(),
    first_published_year: doc.first_publish_year ?? null,
    cover_id: doc.cover_i ?? work.covers?.[0] ?? null,
    pages: doc.number_of_pages_median ?? null,
    subjects: (doc.subject ?? []).slice(0, 20),
    series_name: doc.series_name?.[0] ?? null,
    series_position: doc.series_position?.[0] ?? null,
    description,
    // Out of five, as Open Library reports it. Never rescaled.
    ratings_average: typeof doc.ratings_average === 'number' ? doc.ratings_average : null,
    ratings_count: doc.ratings_count ?? null,
    fetched_at: new Date().toISOString(),
  }

  const { data: saved, error } = await admin
    .from('books')
    .upsert(row, { onConflict: 'ol_key' })
    .select('*')
    .single()

  if (error) {
    console.error('Could not cache book', error)
    return json({ error: error.message }, 500)
  }

  // The title as fetched, recorded against the language it was fetched for —
  // Open Library hands back whichever edition ranks first, in any language,
  // so which language a name belongs to cannot be assumed later.
  await admin
    .from('book_translations')
    .upsert(
      { book_id: saved.id, language, title, description, fetched_at: new Date().toISOString() },
      { onConflict: 'book_id,language' },
    )

  return json({
    id: saved.id,
    olKey: saved.ol_key,
    title: saved.title,
    authors: saved.authors,
    year: saved.first_published_year,
    coverUrl: saved.cover_id ? `https://covers.openlibrary.org/b/id/${saved.cover_id}-L.jpg` : null,
    pages: saved.pages,
    subjects: saved.subjects,
    seriesName: saved.series_name,
    seriesPosition: saved.series_position,
    description: saved.description,
    rating: saved.ratings_average,
    ratingCount: saved.ratings_count,
  })
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
