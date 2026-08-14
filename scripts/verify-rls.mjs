/**
 * Row-level security regression suite.
 *
 * Creates throwaway users, exercises every flow under real RLS as those users,
 * then deletes them. Run it after touching any policy, trigger or migration.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run verify:rls
 *
 * The service role key is NOT stored in the repo. Get it from
 * Project Settings > API, or `npx supabase projects api-keys`.
 *
 * Two bugs this suite caught that nothing else did, both surfacing as the same
 * misleading error — "new row violates row-level security policy":
 *
 *   1. groups: RETURNING is evaluated before AFTER-insert triggers fire, so
 *      the creator was not yet a member when the SELECT policy ran.
 *   2. watchlists: the SELECT policy re-read its own table by id, and during
 *      INSERT ... RETURNING that row is invisible to its own snapshot.
 *
 * Both pointed at WITH CHECK, which was fine in both cases.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function fromEnvFile(key) {
  try {
    const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim()
  } catch {
    return undefined
  }
}

const URL_ = process.env.VITE_SUPABASE_URL ?? fromEnvFile('VITE_SUPABASE_URL')
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? fromEnvFile('VITE_SUPABASE_ANON_KEY')
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_ || !ANON) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env or environment).')
  process.exit(1)
}
if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Needed to create and delete test users.')
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run verify:rls')
  process.exit(1)
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

const users = []
async function makeUser(tag) {
  const email = `fs-test-${tag}-${Math.floor(Math.random() * 1e9)}@example.com`
  const password = 'test-password-12345'
  const username = `test_${tag}_${Math.floor(Math.random() * 1e6)}`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  users.push(data.user.id)

  const client = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`signIn: ${signInErr.message}`)

  return { client, id: data.user.id, username }
}

try {
  console.log('\n=== profile trigger ===')
  const alice = await makeUser('alice')
  const { data: prof } = await alice.client
    .from('profiles')
    .select('username')
    .eq('id', alice.id)
    .single()
  check('profile row auto-created', !!prof, prof?.username)
  check('username taken from metadata', prof?.username === alice.username)

  console.log('\n=== groups ===')
  const { data: groupId, error: gErr } = await alice.client.rpc('create_group', {
    group_name: 'Test Family',
  })
  check('create group via rpc', !gErr && !!groupId, gErr?.message)

  const { data: gm } = await alice.client
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
  check('creator seated as admin', gm?.[0]?.role === 'admin')

  const { data: myGroups, error: mgErr } = await alice.client
    .from('group_members')
    .select('role, group:groups!inner(id, name, members:group_members(count))')
  check('group list query shape', !mgErr, mgErr?.message)
  check('member count embeds', myGroups?.[0]?.group?.members?.[0]?.count === 1)

  console.log('\n=== watchlists ===')
  const { data: wl, error: wlErr } = await alice.client
    .from('watchlists')
    .insert({ name: 'Tonight', group_id: groupId })
    .select('id')
    .single()
  check('create watchlist in group', !wlErr, wlErr?.message)

  const { data: lists, error: lErr } = await alice.client
    .from('watchlists')
    .select('id, name, group:groups(name), items:watchlist_items(count)')
  check('watchlist list query shape', !lErr, lErr?.message)
  check('group name embeds', lists?.[0]?.group?.name === 'Test Family')

  console.log('\n=== catalog + items ===')
  const { data: cat, error: catErr } = await alice.client.functions.invoke('catalog', {
    body: { tmdbId: 238, mediaType: 'movie', language: 'en', country: 'DK' },
  })
  check('catalog a title', !catErr && !!cat?.id, catErr?.message ?? cat?.name)

  const { error: addErr } = await alice.client
    .from('watchlist_items')
    .insert({ watchlist_id: wl.id, title_id: cat.id })
  check('add to watchlist', !addErr, addErr?.message)

  // Column DEFAULTs are the easiest thing to lose silently — added_by is
  // nullable, so a NULL here would never raise, just quietly forget who added it.
  const { data: whoAdded } = await alice.client
    .from('watchlist_items')
    .select('added_by')
    .eq('watchlist_id', wl.id)
    .eq('title_id', cat.id)
    .single()
  check('added_by is recorded, not null', whoAdded?.added_by === alice.id, `${whoAdded?.added_by}`)

  const { data: items, error: itErr } = await alice.client
    .from('watchlist_items')
    .select('title:titles!inner(id, poster_path)')
    .eq('watchlist_id', wl.id)
  check('read watchlist items', !itErr && items?.length === 1, itErr?.message)
  check('poster present', !!items?.[0]?.title?.poster_path)

  console.log('\n=== logging + privacy ===')
  const { data: entry, error: eErr } = await alice.client
    .from('log_entries')
    .insert({ title_id: cat.id, rating: 9, watched_on: '2026-08-01' })
    .select('id')
    .single()
  check('insert log entry, user_id defaulted', !eErr, eErr?.message)

  const { error: nErr } = await alice.client
    .from('entry_notes')
    .insert({ entry_id: entry.id, body: 'private thoughts' })
  check('insert note, owner derived by trigger', !nErr, nErr?.message)

  const bob = await makeUser('bob')

  const { data: bobEntries } = await bob.client
    .from('log_entries')
    .select('id, watched_on')
    .eq('title_id', cat.id)
  check('watch dates hidden from others', (bobEntries ?? []).length === 0)

  const { data: bobNotes } = await bob.client.from('entry_notes').select('body')
  check('notes hidden from others', (bobNotes ?? []).length === 0)

  const { data: bobRatings, error: prErr } = await bob.client
    .from('public_ratings')
    .select('rating')
    .eq('user_id', alice.id)
  check('ratings visible via view', !prErr && bobRatings?.[0]?.rating === 9, prErr?.message)

  const { data: counts } = await bob.client
    .from('public_watch_counts')
    .select('titles_watched')
    .eq('user_id', alice.id)
  check('watch count visible via view', counts?.[0]?.titles_watched === 1)

  const { data: bobGroup } = await bob.client.from('groups').select('id').eq('id', groupId)
  check('groups hidden from non-members', (bobGroup ?? []).length === 0)

  const { data: bobList } = await bob.client.from('watchlists').select('id').eq('id', wl.id)
  check('group watchlist hidden from non-members', (bobList ?? []).length === 0)

  console.log('\n=== membership ===')
  const { error: addMemberErr } = await alice.client
    .from('group_members')
    .insert({ group_id: groupId, user_id: bob.id, role: 'member' })
  check('admin adds a member', !addMemberErr, addMemberErr?.message)

  const { data: bobGroupNow } = await bob.client.from('groups').select('name').eq('id', groupId)
  check('member now sees the group', bobGroupNow?.[0]?.name === 'Test Family')

  // RLS lets you read every membership row of a group you belong to, so the
  // group list must filter to your own row or a group of N appears N times.
  const { data: aliceGroups } = await alice.client
    .from('group_members')
    .select('role, group:groups!inner(id, name)')
    .eq('user_id', alice.id)
  check('group appears once, not once per member', aliceGroups?.length === 1, `${aliceGroups?.length} rows`)

  const { data: bobListNow } = await bob.client.from('watchlists').select('name').eq('id', wl.id)
  check('member now sees the group watchlist', bobListNow?.[0]?.name === 'Tonight')

  // A different title, so this tests the permission rather than re-testing the
  // unique constraint.
  const { data: cat2 } = await bob.client.functions.invoke('catalog', {
    body: { tmdbId: 278, mediaType: 'movie', language: 'en', country: 'DK' },
  })
  const { error: bobWriteErr } = await bob.client
    .from('watchlist_items')
    .insert({ watchlist_id: wl.id, title_id: cat2.id })
  check('member can add to the group list', !bobWriteErr, bobWriteErr?.message)

  const { data: bobAdded } = await alice.client
    .from('watchlist_items')
    .select('added_by')
    .eq('watchlist_id', wl.id)
    .eq('title_id', cat2.id)
    .single()
  check("another member's addition is attributed to them", bobAdded?.added_by === bob.id)

  console.log('\n=== sharing a list after it exists ===')
  const { data: solo, error: soloErr } = await alice.client
    .from('watchlists')
    .insert({ name: 'Just Mine' })
    .select('id')
    .single()
  check('create a private list', !soloErr, soloErr?.message)

  const { data: bobPreShare } = await bob.client
    .from('watchlists')
    .select('id')
    .eq('id', solo.id)
  check('private list is invisible to others', (bobPreShare ?? []).length === 0)

  const { error: shareErr } = await alice.client
    .from('watchlist_members')
    .insert({ watchlist_id: solo.id, user_id: bob.id, role: 'editor' })
  check('owner shares with one person', !shareErr, shareErr?.message)

  const { data: bobPostShare } = await bob.client
    .from('watchlists')
    .select('name')
    .eq('id', solo.id)
  check('shared-with person can now see it', bobPostShare?.[0]?.name === 'Just Mine')

  const { error: bobItemErr } = await bob.client
    .from('watchlist_items')
    .insert({ watchlist_id: solo.id, title_id: cat.id })
  check('editor can add to a shared list', !bobItemErr, bobItemErr?.message)

  // A non-owner UPDATE is not an error under RLS — it simply matches no rows.
  // Checking the value is the only way to know it was refused.
  await bob.client.from('watchlists').update({ group_id: groupId }).eq('id', solo.id)
  const { data: stillPrivate } = await alice.client
    .from('watchlists')
    .select('group_id')
    .eq('id', solo.id)
    .single()
  check('non-owner cannot re-share the list', stillPrivate?.group_id === null, `${stillPrivate?.group_id}`)

  const { error: regroupErr } = await alice.client
    .from('watchlists')
    .update({ group_id: groupId })
    .eq('id', solo.id)
  check('owner moves an existing list into a group', !regroupErr, regroupErr?.message)

  const { data: carolPreview } = await bob.client
    .from('watchlists')
    .select('group_id')
    .eq('id', solo.id)
    .single()
  check('the move actually stuck', carolPreview?.group_id === groupId)

  console.log('\n=== swipe: two people must agree ===')
  const { data: s1, error: s1Err } = await alice.client
    .from('swipe_sessions')
    .insert({ watchlist_id: wl.id, group_id: groupId })
    .select('id')
    .single()
  check('create session', !s1Err, s1Err?.message)

  const { error: joinErr } = await alice.client
    .from('swipe_participants')
    .insert({ session_id: s1.id })
  check('host joins own session', !joinErr, joinErr?.message)

  // The app joins twice for the host: startSession has to seat them before it
  // may build the deck, then the swipe screen joins again on mount. A plain
  // upsert takes the UPDATE path on conflict and swipe_participants has no
  // UPDATE policy, so this used to fail with "(USING expression)".
  const { error: rejoinErr } = await alice.client
    .from('swipe_participants')
    .insert({ session_id: s1.id })
  check(
    're-joining is a tolerable duplicate, not a failure',
    rejoinErr?.code === '23505',
    rejoinErr?.code ?? 'no error at all',
  )

  const { error: bobJoinErr } = await bob.client
    .from('swipe_participants')
    .insert({ session_id: s1.id })
  check('second person joins', !bobJoinErr, bobJoinErr?.message)

  const { count: partCount } = await alice.client
    .from('swipe_participants')
    .select('user_id', { count: 'exact', head: true })
    .eq('session_id', s1.id)
  check('session really has two participants', partCount === 2, `${partCount}`)

  // Previously inserted without checking the error, which hid a missing INSERT
  // policy on swipe_candidates: the deck silently never built, and the match
  // tests still passed because swipes do not reference candidates.
  const { error: deckErr } = await alice.client
    .from('swipe_candidates')
    .insert({ session_id: s1.id, title_id: cat.id, position: 0 })
  check('build the deck', !deckErr, deckErr?.message)

  const { data: deck, error: deckReadErr } = await bob.client
    .from('swipe_candidates')
    .select('title_id')
    .eq('session_id', s1.id)
  check('participants can read the deck', !deckReadErr && deck?.length === 1, deckReadErr?.message)

  const { error: swipeErr } = await alice.client
    .from('swipes')
    .insert({ session_id: s1.id, title_id: cat.id, liked: true })
  check('record a swipe the way the app does', !swipeErr, swipeErr?.message)

  const { data: afterOne } = await alice.client
    .from('swipe_sessions')
    .select('status')
    .eq('id', s1.id)
    .single()
  check('one of two liking is not a match', afterOne?.status === 'open', afterOne?.status)

  await bob.client.from('swipes').insert({ session_id: s1.id, title_id: cat.id, liked: true })
  const { data: afterTwo } = await alice.client
    .from('swipe_sessions')
    .select('status, decided_title_id')
    .eq('id', s1.id)
    .single()
  check('both liking decides it', afterTwo?.status === 'decided', afterTwo?.status)
  check('the right title won', afterTwo?.decided_title_id === cat.id)

  console.log('\n=== swipe: three people decide by majority ===')
  const carol = await makeUser('carol')
  await alice.client
    .from('group_members')
    .insert({ group_id: groupId, user_id: carol.id, role: 'member' })

  const { data: s2 } = await alice.client
    .from('swipe_sessions')
    .insert({ watchlist_id: wl.id, group_id: groupId })
    .select('id')
    .single()

  for (const u of [alice, bob, carol]) {
    await u.client.from('swipe_participants').insert({ session_id: s2.id })
  }
  await alice.client
    .from('swipe_candidates')
    .insert({ session_id: s2.id, title_id: cat.id, position: 0 })

  await alice.client.from('swipes').insert({ session_id: s2.id, title_id: cat.id, liked: true })
  const { data: m1 } = await alice.client
    .from('swipe_sessions')
    .select('status')
    .eq('id', s2.id)
    .single()
  check('one of three is not a majority', m1?.status === 'open', m1?.status)

  await bob.client.from('swipes').insert({ session_id: s2.id, title_id: cat.id, liked: true })
  const { data: m2 } = await alice.client
    .from('swipe_sessions')
    .select('status')
    .eq('id', s2.id)
    .single()
  check('two of three is a majority', m2?.status === 'decided', m2?.status)

  const { data: carolSees } = await carol.client
    .from('swipe_sessions')
    .select('status, decided_title_id')
    .eq('id', s2.id)
    .single()
  check('all participants see the verdict', carolSees?.decided_title_id === cat.id)

  console.log('\n=== swipe: outsiders are shut out ===')
  const dave = await makeUser('dave')
  const { data: daveSees } = await dave.client.from('swipe_sessions').select('id').eq('id', s2.id)
  check('non-members cannot see a session', (daveSees ?? []).length === 0)

  const { error: daveSwipeErr } = await dave.client
    .from('swipes')
    .insert({ session_id: s2.id, title_id: cat.id, liked: true })
  check('non-participants cannot swipe', !!daveSwipeErr, daveSwipeErr?.message?.slice(0, 60))

  console.log('\n=== following ===')
  const { error: followErr } = await alice.client
    .from('follows')
    .insert({ followee_id: bob.id })
  check('follow someone', !followErr, followErr?.message)

  const { count: bobFollowers } = await dave.client
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('followee_id', bob.id)
  check('follower counts are public', bobFollowers === 1, `${bobFollowers}`)

  // follower_id defaults to auth.uid() and WITH CHECK pins it, so this is an
  // attempt to make someone else follow a third party.
  const { error: forgedErr } = await dave.client
    .from('follows')
    .insert({ follower_id: alice.id, followee_id: carol.id })
  check('cannot follow on behalf of someone else', !!forgedErr, forgedErr?.code)

  const { error: unfollowErr } = await alice.client
    .from('follows')
    .delete()
    .eq('follower_id', alice.id)
    .eq('followee_id', bob.id)
  check('unfollow', !unfollowErr, unfollowErr?.message)

  console.log('\n=== group feed ===')
  const { error: postErr } = await alice.client
    .from('activity')
    .insert({ group_id: groupId, kind: 'rated', title_id: cat.id, rating: 9 })
  check('post to the feed', !postErr, postErr?.message)

  const { data: bobFeed, error: bobFeedErr } = await bob.client
    .from('activity')
    .select('kind, rating, actor:profiles!inner(username)')
    .eq('group_id', groupId)
  check('group members read the feed', !bobFeedErr && bobFeed?.length === 1, bobFeedErr?.message)
  check('feed joins the actor', !!bobFeed?.[0]?.actor?.username)

  const { data: daveFeed } = await dave.client.from('activity').select('id').eq('group_id', groupId)
  check('the feed is invisible outside the group', (daveFeed ?? []).length === 0)

  const { error: daveePostErr } = await dave.client
    .from('activity')
    .insert({ group_id: groupId, kind: 'rated', title_id: cat.id, rating: 1 })
  check('outsiders cannot post to a group feed', !!daveePostErr, daveePostErr?.code)

  console.log('\n=== peer ratings on a title ===')
  // What the title page shows for "in your groups": a peer's score, read
  // through the view. It must carry a rating and nothing else.
  const { data: peerView, error: peerErr } = await bob.client
    .from('public_ratings')
    .select('user_id, rating')
    .eq('title_id', cat.id)
    .in('user_id', [alice.id])
  check("a group member's rating is readable", !peerErr && peerView?.[0]?.rating === 9, peerErr?.message)
  check(
    'the view carries no dates',
    peerView?.[0] !== undefined && !('watched_on' in peerView[0]) && !('created_at' in peerView[0]),
    Object.keys(peerView?.[0] ?? {}).join(','),
  )

  // Own history for a title — the rewatch warning in the log form.
  const { data: ownHistory, error: ownErr } = await alice.client
    .from('log_entries')
    .select('id, rating, watched_on')
    .eq('title_id', cat.id)
  check('own history for a title', !ownErr && ownHistory?.length === 1, ownErr?.message)
  check('own history keeps the date', ownHistory?.[0]?.watched_on === '2026-08-01')

  console.log('\n=== public profile ===')
  const { data: aliceSeenByDave } = await dave.client
    .from('profiles')
    .select('username, bio')
    .eq('id', alice.id)
    .maybeSingle()
  check('profiles are public', !!aliceSeenByDave?.username)

  const { error: vandalErr } = await dave.client
    .from('profiles')
    .update({ bio: 'hacked' })
    .eq('id', alice.id)
  await new Promise((r) => setTimeout(r, 100))
  const { data: aliceBio } = await alice.client
    .from('profiles')
    .select('bio')
    .eq('id', alice.id)
    .single()
  check(
    'nobody can edit another profile',
    aliceBio?.bio !== 'hacked',
    vandalErr?.code ?? `bio is ${aliceBio?.bio}`,
  )
} catch (err) {
  console.log(`\nTHREW: ${err.message}`)
  fail++
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id)
  console.log(`\ncleaned up ${users.length} test users`)
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
