/**
 * POST /book-blurb
 *
 * What a book is, and whether this reader would get on with it.
 *
 * Open Library's descriptions run from genuinely good to "Novel. 320 pages."
 * to a list of which edition carried which cover. Where one is thin the book
 * cannot be judged from its own page — which is precisely when someone wants
 * telling what it is.
 *
 * No firewall here. Open Library's data is public domain and their API asks
 * for nothing but a User-Agent, so unlike the film side there is no reason to
 * keep catalogue text out of a prompt — see docs/DECISIONS.md. The promise
 * about notes still holds: they arrive only when the reader has turned that
 * on, and they go into the prompt and nowhere else.
 *
 * Two answers, kept apart on purpose. The description is about the book, so
 * it is written once and shared with everyone. Whether you would like it is
 * about you, and is returned to you alone for the caller to store against
 * their own row.
 *
 * Deploy:  supabase functions deploy book-blurb
 * Secrets: OPENROUTER_API_KEY (already set for the film side)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY')
const MODEL = 'anthropic/claude-haiku-4.5'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

interface Body {
  olKey: string
  ratings?: Rated[]
  notes?: Note[]
  language?: string
}

const MAX_NOTES = 20
const MAX_NOTE_CHARS = 300

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!OPENROUTER_KEY) return json({ error: 'Server is missing OPENROUTER_API_KEY' }, 500)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.olKey) return json({ error: 'olKey is required' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: book, error } = await admin
    .from('books')
    .select(
      'id, title, authors, first_published_year, subjects, series_name, ' +
        'series_position, pages, description, ai_description',
    )
    .eq('ol_key', body.olKey)
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)
  if (!book) return json({ error: 'That book is not in the catalogue yet' }, 404)

  // Written once and shared. A second reader asking about the same book pays
  // for their own half of the answer and not for this one again.
  const needsDescription = !book.ai_description

  const said = await askModel(book, body, needsDescription)
  if (!said) return json({ error: 'The writer is not answering just now' }, 502)

  if (needsDescription && said.description) {
    const { error: writeErr } = await admin
      .from('books')
      .update({ ai_description: said.description, ai_described_at: new Date().toISOString() })
      .eq('id', book.id)
    // Worth knowing about, not worth failing over: the reader still gets an
    // answer, it is just not free for the next person.
    if (writeErr) console.error('Could not keep the description', writeErr)
  }

  return json({
    bookId: book.id,
    description: said.description ?? book.ai_description ?? null,
    would: said.would,
    wouldnt: said.wouldnt ?? null,
  })
})

async function askModel(book: Record<string, unknown>, body: Body, needsDescription: boolean) {
  const ratings = body.ratings ?? []

  const liked = ratings
    .filter((r) => r.score >= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((r) => `${r.title}${r.author ? ` by ${r.author}` : ''} — ${r.score}/10`)
    .join('\n')

  const disliked = ratings
    .filter((r) => r.score <= 4)
    .sort((a, b) => a.score - b.score)
    .slice(0, 15)
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

  const authors = Array.isArray(book.authors) ? (book.authors as string[]).join(', ') : ''
  const subjects = Array.isArray(book.subjects)
    ? (book.subjects as string[]).slice(0, 20).join(', ')
    : ''

  const about = [
    `Title: ${book.title}`,
    authors ? `Author: ${authors}` : '',
    book.first_published_year ? `First published: ${book.first_published_year}` : '',
    book.pages ? `Length: about ${book.pages} pages` : '',
    book.series_name
      ? `Series: ${book.series_name}${book.series_position ? `, book ${book.series_position}` : ''}`
      : '',
    subjects ? `Catalogue subjects: ${subjects}` : '',
    book.description
      ? `The catalogue's own description, which may be poor, partial or about the edition rather than the book:\n"${String(book.description).slice(0, 1500)}"`
      : 'The catalogue has no description of this book.',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = [
    'You are writing for one reader, about one book, in a reading app.',
    '',
    'THE BOOK',
    about,
    '',
    'THE READER',
    liked ? `Books they rated highly:\n${liked}` : 'They have not rated much yet.',
    disliked ? `\nBooks they did not get on with:\n${disliked}` : '',
    notes
      ? `\nThings they wrote in their own words after reading. Weigh these ABOVE` +
        ` the scores — a score says how much, a note says what about it:\n${notes}`
      : '',
    '',
    'WHAT TO WRITE',
    needsDescription
      ? `1. "description": what this book actually is, in 60 to 90 words. Plain` +
        ` and concrete — what happens, who it follows, what it feels like to` +
        ` read. Not a review, no score, no recommendation, and nothing about` +
        ` this particular reader. NO SPOILERS: nothing past roughly the first` +
        ` quarter, and never how it ends. If the catalogue description is` +
        ` already good, do not simply reword it; write the version that says` +
        ` what a person actually wants to know before starting.`
      : '',
    `${needsDescription ? '2' : '1'}. "would": why THIS reader might get on with it, in 25 to 45` +
      ` words, pointing at named books they have actually rated or written` +
      ` about. "You gave X a 9 and this shares its ..." beats a general claim.` +
      ` If you know almost nothing about them, say what kind of reader it` +
      ` suits instead of inventing a link.`,
    `${needsDescription ? '3' : '2'}. "wouldnt": what might put them off, in 25 to 45 words, or null` +
      ` if there is honestly nothing worth warning them about. Be truthful` +
      ` about the real obstacle — length, difficulty, pace, bleakness — and` +
      ` point at their record where you can. Say it kindly: you are helping` +
      ` someone choose, not talking them out of a book or telling them off` +
      ` for what they enjoy. No sneering, and never suggest the book is above` +
      ` them.`,
    '',
    'Never invent a book they have read, a plot point, or a fact about the',
    'book. If the catalogue tells you little and you do not know the book,',
    'say so plainly rather than guessing.',
    body.language && body.language !== 'en'
      ? `Write in the language with code "${body.language}".`
      : '',
    '',
    needsDescription
      ? 'Reply as JSON only: {"description":"","would":"","wouldnt":""}'
      : 'Reply as JSON only: {"would":"","wouldnt":""}',
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
      max_tokens: 900,
      // Lower than the recommendation shelf on purpose. That one had to stop
      // producing the same shelf twice; this is a description of a real book,
      // where invention is the failure mode, not repetition.
      temperature: 0.4,
    }),
  })

  if (!res.ok) {
    console.error('OpenRouter error', res.status, await res.text())
    return null
  }

  try {
    const data = await res.json()
    const parsed = JSON.parse(data.choices[0].message.content)
    if (!parsed.would) return null
    return {
      description: typeof parsed.description === 'string' ? parsed.description.trim() : null,
      would: String(parsed.would).trim(),
      wouldnt:
        typeof parsed.wouldnt === 'string' && parsed.wouldnt.trim() ? parsed.wouldnt.trim() : null,
    }
  } catch (err) {
    console.error('Could not parse model output', err)
    return null
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
