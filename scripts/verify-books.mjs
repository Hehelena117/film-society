/**
 * The book half: search, cache, log, and the privacy promises.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run verify:books
 *
 * Checks the traps the film side paid for, on the new tables:
 *
 *   · The CORS preflight. Node's fetch does NOT preflight, so a function can
 *     pass every test here and still fail in a browser with the opaque
 *     "Failed to send a request to the Edge Function". The OPTIONS request is
 *     therefore made by hand.
 *   · A cache with a read-only grant, so clients cannot write books directly.
 *   · Notes, reading dates and progress readable by nobody but their owner.
 *   · Every table that is written to has a policy for writing.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

import { sweepTestUsers } from './sweep-test-users.mjs'

function fromEnvFile(key) {
  const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`))
  return line?.slice(key.length + 1).trim()
}

const URL_ = process.env.VITE_SUPABASE_URL ?? fromEnvFile('VITE_SUPABASE_URL')
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? fromEnvFile('VITE_SUPABASE_ANON_KEY')
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
await sweepTestUsers(admin)

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

/**
 * A check that depends on Open Library being up.
 *
 * They do go down — three connect attempts in a row failed at 10.7s while
 * this was being written — and when they do, every search assertion here
 * fails at once and reads exactly like a bug in our code. A suite that cannot
 * tell "we broke it" from "they are down" is asserting something it does not
 * know.
 */
let OL_UP = true
const external = (label, ok, detail = '') => {
  if (!OL_UP) {
    console.log(`  SKIP  ${label} — Open Library unreachable`)
    return
  }
  check(label, ok, detail)
}

try {
  await fetch('https://openlibrary.org/search.json?q=dune&fields=key&limit=1', {
    headers: { 'User-Agent': 'FilmSociety/0.1 (verify)' },
    signal: AbortSignal.timeout(10000),
  })
} catch {
  OL_UP = false
  console.log('\nOpen Library is not answering. Its checks are skipped; everything')
  console.log('that does not depend on it still runs.')
}

const users = []
async function makeUser(tag) {
  const email = `fs-test-${tag}-${Math.floor(Math.random() * 1e9)}@example.com`
  const password = 'test-password-12345'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `test_${tag}_${Math.floor(Math.random() * 1e6)}` },
  })
  if (error) throw new Error(error.message)
  users.push(data.user.id)

  const client = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(signInErr.message)
  return { client, id: data.user.id }
}

try {
  console.log('\n=== CORS preflight (what Node never checks) ===')
  for (const fn of ['openlibrary', 'books']) {
    const res = await fetch(`${URL_}/functions/v1/${fn}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        // Exactly what supabase-js sends. Leaving these out of the response's
        // allow-headers is what breaks the browser and nothing else.
        'Access-Control-Request-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
    const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase()
    check(
      `${fn}: preflight allows what supabase-js sends`,
      res.ok && ['authorization', 'x-client-info', 'apikey', 'content-type'].every((h) =>
        allowed.includes(h),
      ),
      `${res.status} ${allowed || '(no header)'}`,
    )
  }

  const alice = await makeUser('alice')

  console.log('\n=== search ===')
  const { data: found, error: sErr } = await alice.client.functions.invoke(
    'openlibrary?q=' + encodeURIComponent('The Fellowship of the Ring'),
    { method: 'GET' },
  )
  external('search returns results', !sErr && found?.results?.length > 0, sErr?.message)
  external(
    'series is read, not lost to the wrong field name',
    found?.results?.[0]?.seriesName?.includes('Lord of the Rings'),
    `${found?.results?.[0]?.seriesName} #${found?.results?.[0]?.seriesPosition}`,
  )

  external(
    'search carries a rating',
    found?.results?.some((r) => typeof r.rating === 'number'),
    `${found?.results?.[0]?.rating ?? 'none'} / 5`,
  )

  // The measured problem: Open Library hands back whichever edition ranks
  // first, in any language. Typing English must not return Cyrillic — and
  // language:eng does NOT fix it, because the work HAS English editions; only
  // its display title is Russian. What fixes it is dropping results that do
  // not resemble what was typed.
  const { data: cp } = await alice.client.functions.invoke(
    'openlibrary?q=' + encodeURIComponent('Crime and Punishment'),
    { method: 'GET' },
  )
  const titles = (cp?.results ?? []).map((r) => r.title)
  external(
    'no foreign-script titles survive an English search',
    titles.length > 0 && titles.every((x) => /^[\x20-\x7E]+$/.test(x)),
    titles.slice(0, 3).join(' | '),
  )
  external(
    'and every result is actually about the book asked for',
    titles.every((x) => /crime|punishment|dostoev/i.test(x)),
    titles.slice(0, 4).join(' | '),
  )

  // Searching by author matches no title at all. Before the author check the
  // relevance filter would have thrown every one of these away.
  const { data: byAuthor } = await alice.client.functions.invoke(
    'openlibrary?q=' + encodeURIComponent('tolkien'),
    { method: 'GET' },
  )
  external(
    'an author search still returns their books',
    (byAuthor?.results ?? []).length >= 3,
    `${(byAuthor?.results ?? []).length} results`,
  )

  // Nothing on our side can make Open Library quick, but it must not hang.
  const t0 = Date.now()
  await alice.client.functions.invoke('openlibrary?q=' + encodeURIComponent('dune herbert'), {
    method: 'GET',
  })
  const took = Date.now() - t0
  external('a search answers within the deadline', took < 12_000, `${took}ms`)

  console.log('\n=== the cache has one door ===')
  const { error: sneak } = await alice.client
    .from('books')
    .insert({ ol_key: 'OL999999W', title: 'Straight into the cache' })
  check('clients cannot write the cache directly', !!sneak, sneak?.message?.slice(0, 45))

  const { data: cataloged, error: cErr } = await alice.client.functions.invoke('books', {
    body: { olKey: 'OL27448W', language: 'en' },
  })
  external('cataloguing a book works', !cErr && !!cataloged?.id, cErr?.message ?? cataloged?.title)
  external('it carries a cover', !!cataloged?.coverUrl, cataloged?.coverUrl ? 'yes' : 'no cover')
  external('it carries its series', cataloged?.seriesName?.includes('Lord of the Rings'), cataloged?.seriesName)
  external(
    'it carries a rating, out of five and not rescaled',
    typeof cataloged?.rating === 'number' && cataloged.rating > 0 && cataloged.rating <= 5,
    `${cataloged?.rating} from ${cataloged?.ratingCount} readers`,
  )

  // Everything below is about OUR rules, not theirs. If Open Library could not
  // be reached the cache write never happened, so seed the row directly — the
  // point of these checks is row-level security, and RLS does not care where a
  // row came from.
  let book = cataloged
  if (!book?.id) {
    const { data: seeded } = await admin
      .from('books')
      .upsert(
        { ol_key: 'OL27448W', title: 'The Lord of the Rings', authors: ['J.R.R. Tolkien'] },
        { onConflict: 'ol_key' },
      )
      .select('id')
      .single()
    book = seeded
  }

  console.log('\n=== reading log, and what stays private ===')
  const { data: entry, error: eErr } = await alice.client
    .from('book_log_entries')
    .insert({ book_id: book.id, rating: 9, finished_on: '2026-08-01' })
    .select('id')
    .single()
  check('log a book, user_id defaulted', !eErr && !!entry, eErr?.message)

  const { error: nErr } = await alice.client
    .from('book_entry_notes')
    .insert({ entry_id: entry.id, body: 'Read it in one weekend.' })
  check('write a private note', !nErr, nErr?.message)

  const { error: pErr } = await alice.client
    .from('book_progress')
    .insert({ book_id: book.id, percent: 34 })
  check('record progress', !pErr, pErr?.message)

  const { error: badPct } = await alice.client
    .from('book_progress')
    .update({ percent: 140 })
    .eq('book_id', book.id)
  check('progress cannot exceed 100', !!badPct, badPct?.message?.slice(0, 40))

  const bob = await makeUser('bob')

  const { data: bobEntries } = await bob.client
    .from('book_log_entries')
    .select('id, finished_on')
    .eq('book_id', book.id)
  check('reading dates hidden from others', (bobEntries ?? []).length === 0)

  const { data: bobNotes } = await bob.client.from('book_entry_notes').select('body')
  check('notes hidden from others', (bobNotes ?? []).length === 0)

  const { data: bobProgress } = await bob.client.from('book_progress').select('percent')
  check('progress hidden from others', (bobProgress ?? []).length === 0)

  const { data: ratings, error: rErr } = await bob.client
    .from('public_book_ratings')
    .select('rating')
    .eq('user_id', alice.id)
  check('ratings visible through the view', !rErr && ratings?.[0]?.rating === 9, rErr?.message)

  const { data: counts } = await bob.client
    .from('public_book_counts')
    .select('books_read')
    .eq('user_id', alice.id)
  check('book count visible through the view', counts?.[0]?.books_read === 1)

  console.log('\n=== the two sides stay apart ===')
  const { data: filmGroup } = await alice.client.rpc('create_group', { group_name: 'Film Night' })
  const { error: sideErr } = await admin
    .from('groups')
    .update({ side: 'book' })
    .eq('id', filmGroup)
  check('a group belongs to one side', !sideErr, sideErr?.message)

  // Following for books is a different act from following for films, so the
  // same pair must be able to exist twice.
  await alice.client.from('follows').insert({ followee_id: bob.id, side: 'film' })
  const { error: bothErr } = await alice.client
    .from('follows')
    .insert({ followee_id: bob.id, side: 'book' })
  check('you can follow the same person on both sides', !bothErr, bothErr?.message)

  const { data: sides } = await alice.client
    .from('follows')
    .select('side')
    .eq('follower_id', alice.id)
    .eq('followee_id', bob.id)
  check('and they are two separate rows', sides?.length === 2, `${sides?.length}`)

  console.log('\n=== reading lists, groups and deciding together ===')
  const { data: bookGroup, error: bgErr } = await alice.client.rpc('create_group', {
    group_name: 'Book Club',
    group_side: 'book',
  })
  check('create a book group', !bgErr && !!bookGroup, bgErr?.message)

  const { data: groupRow } = await admin.from('groups').select('side').eq('id', bookGroup).single()
  check('it lands on the book side', groupRow?.side === 'book', groupRow?.side)

  const { data: filmSideGroups } = await alice.client
    .from('group_members')
    .select('group:groups!inner(id, side)')
    .eq('user_id', alice.id)
    .eq('group.side', 'film')
  check(
    'a book group does not show on the film side',
    !(filmSideGroups ?? []).some((g) => g.group.id === bookGroup),
    `${(filmSideGroups ?? []).length} film group(s)`,
  )

  const { data: list, error: rlErr } = await alice.client
    .from('reading_lists')
    .insert({ name: 'Winter reading', group_id: bookGroup })
    .select('id')
    .single()
  // The trap the film side hit twice: a SELECT policy that re-reads its own
  // table cannot see the row during INSERT ... RETURNING.
  check('create a reading list in a group', !rlErr, rlErr?.message)

  const { error: addErr } = await alice.client
    .from('reading_list_items')
    .insert({ list_id: list.id, book_id: book.id })
  check('add a book to it', !addErr, addErr?.message)

  const { data: addedBy } = await alice.client
    .from('reading_list_items')
    .select('added_by')
    .eq('list_id', list.id)
    .single()
  check('added_by is recorded, not null', addedBy?.added_by === alice.id, `${addedBy?.added_by}`)

  // Bob is not in the group yet, so the list is none of his business.
  const { data: bobPeek } = await bob.client.from('reading_lists').select('id').eq('id', list.id)
  check('lists are hidden from outsiders', (bobPeek ?? []).length === 0)

  await alice.client
    .from('group_members')
    .insert({ group_id: bookGroup, user_id: bob.id, role: 'member' })

  const { data: bobSees } = await bob.client.from('reading_lists').select('id').eq('id', list.id)
  check('and visible once he is in the group', (bobSees ?? []).length === 1)

  const { data: session, error: sessErr } = await alice.client
    .from('book_swipe_sessions')
    .insert({ list_id: list.id, group_id: bookGroup })
    .select('id')
    .single()
  check('open a session', !sessErr, sessErr?.message)

  for (const u of [alice, bob]) {
    const { error } = await u.client
      .from('book_swipe_participants')
      .insert({ session_id: session.id })
    check(`join the session (${u === alice ? 'alice' : 'bob'})`, !error, error?.message)
  }

  // Checked, not assumed. The film deck was dead for a week because the test
  // inserted candidates and never looked at the error.
  const { error: deckErr } = await alice.client
    .from('book_swipe_candidates')
    .insert({ session_id: session.id, book_id: book.id, position: 0 })
  check('stock the deck', !deckErr, deckErr?.message)

  const { data: bobDeck } = await bob.client
    .from('book_swipe_candidates')
    .select('book_id')
    .eq('session_id', session.id)
  check('the other person can read the deck', (bobDeck ?? []).length === 1)

  for (const u of [alice, bob]) {
    const { error } = await u.client
      .from('book_swipes')
      .insert({ session_id: session.id, book_id: book.id, liked: true })
    check(`vote (${u === alice ? 'alice' : 'bob'})`, !error, error?.message)
  }

  const { data: votes } = await alice.client
    .from('book_swipes')
    .select('user_id, liked')
    .eq('session_id', session.id)
  check('both votes are there — two people, both yes', (votes ?? []).length === 2)

  const { error: settleErr } = await alice.client
    .from('book_swipe_sessions')
    .update({ decided_book_id: book.id, closed_at: new Date().toISOString() })
    .eq('id', session.id)
  check('settle on it', !settleErr, settleErr?.message)

  console.log('\n=== shelf feedback ===')
  const { error: fbErr } = await alice.client.from('book_recommendation_feedback').upsert(
    {
      user_id: alice.id,
      ol_key: 'OL27448W',
      title: 'The Fellowship of the Ring',
      verdict: 'less',
    },
    { onConflict: 'user_id,ol_key' },
  )
  check('record a verdict', !fbErr, fbErr?.message)

  const { data: peek } = await bob.client
    .from('book_recommendation_feedback')
    .select('title')
    .eq('ol_key', 'OL27448W')
  check('nobody else can read it', (peek ?? []).length === 0)
} catch (err) {
  console.log(`\nTHREW: ${err.message}`)
  fail++
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id)
  console.log(`\ncleaned up ${users.length} test users`)
  console.log(`${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
