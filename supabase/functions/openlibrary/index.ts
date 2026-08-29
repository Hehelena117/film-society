/**
 * GET /openlibrary?q=...&language=en
 *
 * Book search. The Open Library equivalent of the `tmdb` function.
 *
 * Unlike TMDB, Open Library needs no key and its data is public domain, so
 * this proxy is not hiding a secret. It exists for three other reasons:
 * one place to set the User-Agent they ask for, one place to fix the
 * language problem below, and one shape of result for the client whatever
 * Open Library changes about theirs.
 *
 * THE LANGUAGE PROBLEM, measured rather than assumed:
 *
 *   Searching "Crime and Punishment" returns «Преступление и наказание».
 *   Searching a Danish novel by its Danish title returns the English
 *   translation, or a book ABOUT it. Open Library ranks by an internal score
 *   and hands back whichever edition wins, in whatever language it happens
 *   to be in.
 *
 *   So results whose title does not resemble what was typed are pushed down
 *   rather than dropped — dropping them would lose the correct book when
 *   someone searches by author, and leaving them first shows a Russian title
 *   to someone who typed English.
 *
 * Deploy: supabase functions deploy openlibrary
 */

import { pickAuthor, tidyName } from '../_shared/names.ts'

const UA = 'FilmSociety/0.1 (https://github.com/Hehelena117/film-society)'

// supabase-js attaches x-client-info and apikey on every call. Omitting them
// here fails the browser's preflight, and the error surfaces as the opaque
// "Failed to send a request to the Edge Function" — no status, no body,
// because the request never leaves the browser.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

/**
 * Asked for explicitly. `series` is NOT a field — the field names are
 * series_name and series_position, and asking for the wrong one returns
 * nothing at all rather than an error, which is how I first concluded Open
 * Library had no series data. It has.
 */
const FIELDS = [
  'key',
  'title',
  'author_name',
  'first_publish_year',
  'cover_i',
  'number_of_pages_median',
  'subject',
  'series_name',
  'series_position',
  'author_key',
  'author_alternative_name',
  'ratings_average',
  'ratings_count',
].join(',')

/**
 * Eight, not twenty. Measured, and it is the whole of the speed problem:
 * Open Library takes 2.6–3.3 seconds to return twenty results and about 0.4
 * for eight. Nobody scrolls a search box past the eighth answer anyway.
 */
const LIMIT = 8

/**
 * Books about books, which Open Library holds as ordinary works.
 *
 * A search for Kafka on the Shore led with "A Study Guide for Haruki
 * Murakami's Kafka on the Shore" by a textbook publisher, and Crime and
 * Punishment with "Crime and Punishment Notes". Both contain the title asked
 * for and are therefore perfectly good matches by every other measure here —
 * they are simply not the book anyone means.
 *
 * Pushed down rather than removed: someone may genuinely be looking for a
 * companion volume, and it is not this function's place to refuse them.
 */
const APPARATUS =
  /\b(study guide|sparknotes|cliffsnotes|shmoop|summary|analysis|notes?|companion|handbook|casebook|a guide to|guide for|readers? guide|critical (essays|edition|companion)|bloom'?s)\b/i

/**
 * How alike two titles are, 0 to 1.
 *
 * Levenshtein over the normalised strings. Needed because containment alone
 * treats "predjudice" as having nothing to do with "prejudice", which is
 * exactly the case a reader hits when they misspell something.
 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  const rows = a.length + 1
  const cols = b.length + 1
  let prev = Array.from({ length: cols }, (_, i) => i)

  for (let i = 1; i < rows; i++) {
    const row = [i]
    for (let j = 1; j < cols; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }

  return 1 - prev[cols - 1] / Math.max(a.length, b.length)
}

/** Close enough that a person would call it the same title. */
const NEARLY = 0.82

/**
 * Does this title look like what was typed?
 *
 * Whole-title similarity alone is not enough, and the failure is instructive:
 * "hary potter" against "harry potter and the philosopher's stone" scores
 * about 0.4, because most of the title is words the reader never typed. So
 * every typed word has to find a near match SOMEWHERE in the title instead —
 * "hary" finds "harry", "potter" finds "potter", and the rest of the title is
 * allowed to be as long as it likes.
 *
 * That also keeps rubbish out: "the lord of the rigns" finds nothing in
 * "Anno XXVII. Henrici VIII", which is what a search for a Tolkien novel was
 * answering with before this existed.
 */
function looksLike(got: string, asked: string): boolean {
  if (got.length < 3 || !asked) return false
  if (got.includes(asked) || asked.includes(got)) return true
  if (similarity(got, asked) >= NEARLY) return true

  const wanted = asked.split(' ').filter((w) => w.length >= 3)
  if (!wanted.length) return false

  const have = got.split(' ').filter(Boolean)
  return wanted.every((w) =>
    have.some((h) => h === w || h.includes(w) || similarity(h, w) >= 0.78),
  )
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q) return json({ results: [] })

  const search = new URL('https://openlibrary.org/search.json')
  search.searchParams.set('q', q)
  search.searchParams.set('fields', FIELDS)
  search.searchParams.set('limit', String(LIMIT))

  // Open Library is the whole of the latency here — measured at 4.0s direct
  // versus 4.0s through this function, and it times out outright often enough
  // to matter. Without a deadline the search box just spins forever, which is
  // the worst of the available outcomes; failing at eight seconds at least
  // lets someone try again.
  const deadline = AbortSignal.timeout(8000)

  let data: Record<string, unknown>
  try {
    const res = await fetch(search, { headers: { 'User-Agent': UA }, signal: deadline })
    if (!res.ok) {
      console.error('Open Library error', res.status)
      return json({ results: [], unavailable: true })
    }
    data = await res.json()
  } catch (err) {
    console.error('Open Library timed out or failed', err)
    // 200, deliberately, with the bad news in the body.
    //
    // supabase-js throws away the body of a non-2xx and hands the caller the
    // string "Edge Function returned a non-2xx status code" — which is what a
    // real search showed a real person during an Open Library outage. It names
    // the wrong component, suggests the app is broken, and offers nothing to
    // do about it.
    //
    // This function did its job. The catalogue it asks did not, and that is a
    // fact worth reporting in words the client can actually show.
    return json({ results: [], unavailable: true })
  }
  /**
   * Ask again, fuzzily, when the plain search comes back thin.
   *
   * Open Library is Solr underneath and accepts the ~ operator, which their
   * ordinary search does not use: "pride and predjudice" plain can miss the
   * book entirely, while title:(pride~2 predjudice~2) finds it. Only run when
   * the first answer was poor, so the usual search costs nothing extra.
   *
   * Not a cure-all — "the hobbbit" returns nothing either way, because three
   * b's is past what their index will forgive.
   */
  async function fuzzyRetry(): Promise<Record<string, unknown>[]> {
    const words = q
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean)
    if (!words.length) return []

    const fuzzy = new URL('https://openlibrary.org/search.json')
    fuzzy.searchParams.set('q', 'title:(' + words.map((w) => w + '~2').join(' ') + ')')
    fuzzy.searchParams.set('fields', FIELDS)
    fuzzy.searchParams.set('limit', String(LIMIT))

    try {
      const res = await fetch(fuzzy, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return []
      return ((await res.json()).docs ?? []) as Record<string, unknown>[]
    } catch {
      return []
    }
  }

  const asked = normalise(q)

  let docs = (data.docs ?? []) as Record<string, unknown>[]

  // Retry on the QUALITY of the answer, not the quantity of it.
  //
  // Triggering on `docs.length < 3` looked reasonable and was wrong: "the lord
  // of the rigns" comes back with several results, none of them Tolkien — a
  // Tudor statute among them — so the count is healthy, the retry never fires,
  // and the reader gets nothing useful. What matters is whether any of it
  // resembles what they typed.
  const promising = docs.filter((d) =>
    looksLike(normalise(String(d.title ?? '')), normalise(q)),
  ).length

  if (promising < 3) {
    const more = await fuzzyRetry()
    const seenKeys = new Set(docs.map((d) => String(d.key)))
    const asked0 = normalise(q)

    // A fuzzy query is generous by design, and generosity brings rubbish:
    // 'the lord of the rigns' came back with a Tudor statute, because ~2 on
    // 'rigns' also matches 'reigns'. Anything the retry offers has to look
    // like what was typed before it is allowed onto the list.
    docs = [
      ...docs,
      ...more.filter((d) => {
        if (seenKeys.has(String(d.key))) return false
        return looksLike(normalise(String(d.title ?? '')), asked0)
      }),
    ]
  }

  const scored = docs
    .filter((d: Record<string, unknown>) => d.key && d.title)
    .map((d: Record<string, any>) => {
      const got = normalise(String(d.title))

      // Ranked, not merely filtered. Filtering alone left "Crime and
      // Punishment Notes" — a study guide — above Crime and Punishment, and
      // left 海辺のカフカ at the top of a search for Kafka on the Shore,
      // because both survived the keep-everything fallback in their original
      // order. What was asked for exactly has to win.
      //
      // The length guard is load-bearing. A title in a non-Latin script
      // normalises to the empty string, and every string contains the empty
      // string — so «Преступление и наказание» once scored as a perfect match.
      // A near miss counts as a hit. Ranking on EXACT equality promoted a
      // typo-titled reprint with no ratings above the real Pride and
      // Prejudice, because the reprint matched the misspelling perfectly —
      // measured, not imagined. Everything close enough now shares the top
      // band, and the tie-break below decides between them on how many people
      // have actually read the thing.
      const alike = got.length >= 3 ? similarity(got, asked) : 0
      const exact = alike >= NEARLY
      const contains = got.length >= 3 && (got.includes(asked) || asked.includes(got))

      // Searching by author is normal and matches no title at all, so the
      // author has to count too — otherwise "tolkien" would drop everything.
      const authorMatches = (d.author_name ?? []).some((a: string) => {
        const name = normalise(a)
        return name.length >= 3 && (name.includes(asked) || asked.includes(name))
      })

      // Only when it is not what was asked for: someone searching for
      // "sparknotes" should still be given sparknotes.
      const isApparatus = APPARATUS.test(String(d.title)) && !APPARATUS.test(q)

      // A title that normalises away entirely is written in a script this
      // reader cannot read, and can never be the answer they wanted — even
      // when it is the most-rated edition of exactly the right book, which
      // 海辺のカフカ is. Sunk hard rather than merely unranked, or it wins the
      // rating tiebreak against everything else on zero.
      const unreadable = got.length < 3

      return {
        rank:
          (exact ? 3 : contains ? 2 : authorMatches ? 1 : 0) -
          (isApparatus ? 2 : 0) -
          (unreadable ? 4 : 0),
        // Near matches count as relevant too, not merely rank well. Leaving this on
        // plain containment DROPPED "Pride and Prejudice" from a search for "pride
        // and predjudice" — four typo-titled reprints passed the gate, which met
        // the threshold to discard everything else, including the one book the
        // reader obviously wanted.
        relevant: looksLike(got, asked) || authorMatches,
        book: {
          olKey: String(d.key).replace('/works/', ''),
          title: d.title,
          authors: readableAuthor(d, data.docs ?? []),
          year: d.first_publish_year ?? null,
          coverId: d.cover_i ?? null,
          pages: d.number_of_pages_median ?? null,
          seriesName: d.series_name?.[0] ?? null,
          seriesPosition: d.series_position?.[0] ?? null,
          subjects: (d.subject ?? []).slice(0, 12),
          // Open Library's own scale is out of five. Kept as it comes rather
          // than rescaled, so it can never be mistaken for one of our 1-10s.
          rating: typeof d.ratings_average === 'number' ? d.ratings_average : null,
          ratingCount: d.ratings_count ?? null,
        },
      }
    })

  // Dropped, not merely sorted below. Open Library answers "crime and
  // punishment" with Cesare Beccaria and a book called Anxiety; pushing those
  // to the bottom still leaves them in the list, and a search box with four
  // wrong answers under two right ones reads as broken.
  //
  // Filtering only kicks in once enough good matches survive — a search for
  // something obscure keeps everything rather than coming back empty.
  // Only what resembles the query, and nothing at all when nothing does.
  //
  // This used to keep EVERYTHING whenever fewer than three results looked
  // right, on the reasoning that an odd list beats an empty one. Measured, it
  // does not: 'the lord of the rigns' answered with a Tudor statute, because
  // the statute was the only thing Open Library returned and so it won by
  // default. A search box that says it found nothing is understood instantly;
  // one that offers Anno XXVII. Henrici VIII is not.
  const chosen = scored.filter((s: { relevant: boolean }) => s.relevant)

  // Within a rank, the most-rated edition first. Open Library holds a separate
  // work for every translation and study guide, and the one everybody has
  // actually read is the one everybody has actually rated — which is the
  // closest thing available to "the real edition of this book".
  chosen.sort(
    (
      a: { rank: number; book: { ratingCount: number | null } },
      b: { rank: number; book: { ratingCount: number | null } },
    ) => b.rank - a.rank || (b.book.ratingCount ?? 0) - (a.book.ratingCount ?? 0),
  )

  return json({ results: chosen.map((s: { book: unknown }) => s.book) })
})

/** The author's name in an alphabet the reader can read. See _shared/names.ts. */
function readableAuthor(doc: Record<string, any>, all: Record<string, any>[]): string[] {
  const picked = pickAuthor(doc, all)
  return picked ? [tidyName(picked)] : (doc.author_name ?? [])
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
