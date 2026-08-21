/**
 * POST /book-recommend
 *
 * The next stretch of the shelf.
 *
 * No firewall here. Open Library's data is public domain and their API asks
 * for nothing but a User-Agent, so unlike the film side there is no reason to
 * keep catalogue data out of a prompt — see docs/DECISIONS.md. What still
 * applies is the promise about notes: they reach this function only when the
 * reader has turned that on, and they go into the prompt and nowhere else.
 *
 * Deploy:  supabase functions deploy book-recommend
 * Secrets: OPENROUTER_API_KEY (already set for the film side)
 */

import { pickAuthor, tidyName } from '../_shared/names.ts'

const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY')
const MODEL = 'anthropic/claude-haiku-4.5'
const UA = 'FilmSociety/0.1 (https://github.com/Hehelena117/film-society)'

interface Rated {
  title: string
  author: string | null
  score: number
}

interface Note {
  title: string
  score: number | null
  body: string
}

interface Verdict {
  title: string
  author: string | null
}

/**
 * A film they loved, crossing over from the other half. Titles and scores
 * only — never notes, whichever side's switch happens to be on.
 *
 * Allowed more often than the reverse. Someone opening the book side has a
 * long watch history and almost nothing read yet, so films are the best
 * evidence available about their taste; someone on the film side already has
 * a full film log and came here to be told about films.
 */
const CROSSOVER_LIMIT = 3

interface CrossoverFilm {
  name: string
  year: number | null
  score: number
}

interface Body {
  ratings: Rated[]
  notes?: Note[]
  feedback?: { more?: Verdict[]; less?: Verdict[] }
  crossover?: CrossoverFilm[]
  excludeTitles: string[]
  count?: number
  language?: string
}

const MAX_NOTES = 30
const MAX_NOTE_CHARS = 400

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!OPENROUTER_KEY) return json({ error: 'Server is missing OPENROUTER_API_KEY' }, 500)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const count = Math.min(body.count ?? 6, 12)
  const suggestions = await askModel(body, count)
  if (!suggestions.length) return json({ recommendations: [] })

  const resolved = await Promise.all(
    suggestions.map(async (s) => {
      const book = await resolveOnOpenLibrary(s.title, s.author)
      return book ? { book, reason: s.reason } : null
    }),
  )

  return json({ recommendations: resolved.filter(Boolean) })
})

async function askModel(body: Body, count: number) {
  const liked = body.ratings
    .filter((r) => r.score >= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((r) => `${r.title}${r.author ? ` by ${r.author}` : ''} — ${r.score}/10`)
    .join('\n')

  const disliked = body.ratings
    .filter((r) => r.score <= 4)
    .sort((a, b) => a.score - b.score)
    .slice(0, 20)
    .map((r) => `${r.title}${r.author ? ` by ${r.author}` : ''} — ${r.score}/10`)
    .join('\n')

  const notes = (body.notes ?? [])
    .slice(0, MAX_NOTES)
    .filter((n) => n.body?.trim())
    .map(
      (n) =>
        `${n.title}${n.score !== null ? `, rated ${n.score}/10` : ''}: "${n.body.trim().slice(0, MAX_NOTE_CHARS)}"`,
    )
    .join('\n')

  const list = (items: Verdict[] | undefined) =>
    (items ?? [])
      .slice(-40)
      .map((v) => `${v.title}${v.author ? ` by ${v.author}` : ''}`)
      .join('\n')

  const fromFilms = (body.crossover ?? [])
    .filter((f) => f.score >= 8)
    .slice(0, 12)
    .map((f) => `${f.name}${f.year ? ` (${f.year})` : ''} — ${f.score}/10`)
    .join('\n')

  const wantMore = list(body.feedback?.more)
  const wantLess = list(body.feedback?.less)

  const prompt = [
    'A reader rated these books highly:',
    liked || '(nothing rated yet — suggest widely admired books across several kinds)',
    disliked ? `\nThey did NOT get on with these — steer away from what they share:\n${disliked}` : '',
    notes
      ? `\nThey wrote these notes in their own words. Weigh these ABOVE the scores:` +
        ` a score says how much, a note says what about it. If a note praises or` +
        ` complains about something specific — the prose, the pacing, the ending,` +
        ` how it is narrated — treat that as the strongest signal you have:\n${notes}`
      : '',
    wantMore
      ? `\nOn the shelf they pressed "more like this" — they have not necessarily` +
        ` read these, they are telling you what to aim at:\n${wantMore}`
      : '',
    wantLess
      ? `\nThey pressed "not for me" on these. Never offer them, and steer clear` +
        ` of what they have in common:\n${wantLess}`
      : '',
    fromFilms
      ? `\nThey also WATCHED these and thought highly of them:\n${fromFilms}\n` +
        `For AT MOST ${CROSSOVER_LIMIT} of your suggestions you may justify a book` +
        ` by one of these films rather than by their reading. When you do, say so` +
        ` plainly, in the form "Because you enjoyed <film>, you might like this".` +
        ` Only where the connection is real — a strained one is worse than none.`
      : '',
    body.excludeTitles.length
      ? `\nAlready read or already suggested — do not offer any of these:\n${body.excludeTitles.slice(0, 200).join(', ')}`
      : '',
    `\nSuggest ${count} books that appear nowhere above. Vary era, country, and`,
    `register rather than offering the same canon every time — and do not offer`,
    `six of one author. Real books only, with the author's name exactly as it is`,
    `usually printed, so they can be looked up.`,
    `For each, give a one-sentence reason referring to their actual reading.`,
    notes
      ? `Where a note explains the choice, say so and quote a few of their own words back.`
      : '',
    `Reply as JSON only: {"suggestions":[{"title":"","author":"","reason":""}]}`,
  ]
    .filter(Boolean)
    .join('\n')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      // Loosened for the same reason as the film side: at a low temperature
      // the same log produced the same shelf every time, which read as broken.
      temperature: 0.9,
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

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Looks a suggestion up so it can be shown, and so an invented book is dropped. */
async function resolveOnOpenLibrary(title: string, author: string | null) {
  const q = author ? `${title} ${author}` : title
  const url =
    'https://openlibrary.org/search.json?q=' +
    encodeURIComponent(q) +
    '&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,author_key,author_alternative_name,series_name,series_position,ratings_average,ratings_count&limit=8'

  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null

  const docs = (await res.json()).docs ?? []
  if (!docs.length) return null

  const asked = normalise(title)
  const askedAuthor = author ? normalise(author) : null

  /**
   * Which of these is the book that was actually meant?
   *
   * Loose containment alone is not enough, and this is not hypothetical:
   * asking for The Master and Margarita returns Klimowski's graphic-novel
   * adaptation, and asking for Kafka on the Shore returns a study guide by a
   * textbook publisher. Both contain the title asked for; neither is the book.
   *
   * So an exact title beats a containing one, and matching the author beats
   * both — a study guide is by whoever wrote the study guide.
   */
  const score = (d: Record<string, any>) => {
    const got = normalise(String(d.title ?? ''))
    // Load-bearing: a title in a non-Latin script normalises to the empty
    // string, and every string contains the empty string.
    if (got.length < 3) return -1
    if (!got.includes(asked) && !asked.includes(got)) return -1

    const names = [...(d.author_name ?? []), ...(d.author_alternative_name ?? [])].map(normalise)
    const byThem = askedAuthor
      ? names.some((n) => n.includes(askedAuthor) || askedAuthor.includes(n))
      : false

    return (got === asked ? 2 : 0) + (byThem ? 4 : 0)
  }

  const ranked = docs
    .map((d: Record<string, any>) => ({ d, s: score(d) }))
    .filter((x: { s: number }) => x.s >= 0)
    .sort((a: { s: number }, b: { s: number }) => b.s - a.s)

  const hit = ranked[0]?.d
  if (!hit) return null

  const picked = pickAuthor(hit, docs, author)
  const readableAuthor = picked ? tidyName(picked) : null

  return {
    olKey: String(hit.key).replace('/works/', ''),
    title: hit.title,
    // The readable form of the name, which frequently lives on a DIFFERENT
    // record from the readable title. See _shared/names.ts.
    authors: readableAuthor ? [readableAuthor] : (hit.author_name ?? []),
    year: hit.first_publish_year ?? null,
    coverUrl: hit.cover_i ? `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg` : null,
    pages: hit.number_of_pages_median ?? null,
    seriesName: hit.series_name?.[0] ?? null,
    seriesPosition: hit.series_position?.[0] ?? null,
    rating: typeof hit.ratings_average === 'number' ? hit.ratings_average : null,
    ratingCount: hit.ratings_count ?? null,
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
