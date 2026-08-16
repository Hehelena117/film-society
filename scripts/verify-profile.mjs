/**
 * Does a big collection still read well?
 *
 * Seeds a log with enough films to crowd the old layouts, then checks the
 * shelves, the month groups and the collection screen in a real browser —
 * including the measurement that matters: the profile must be SHORTER than the
 * flat grid it replaced, not just differently arranged.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-profile.mjs
 *
 * Assumes the dev server is already running on :5173.
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function fromEnvFile(key) {
  const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`))
  return line?.slice(key.length + 1).trim()
}

const URL_ = process.env.VITE_SUPABASE_URL ?? fromEnvFile('VITE_SUPABASE_URL')
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? fromEnvFile('VITE_SUPABASE_ANON_KEY')
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.APP_URL ?? 'http://localhost:5173'

if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

// Ratings chosen to make several shelves, with one clearly the fullest.
const SEED = [
  { tmdb: 238, rating: 10, on: '2026-08-02' },
  { tmdb: 278, rating: 10, on: '2026-08-04' },
  { tmdb: 424, rating: 9, on: '2026-08-06' },
  { tmdb: 680, rating: 9, on: '2026-08-08' },
  { tmdb: 550, rating: 8, on: '2026-08-10', note: 'The soap plot is the best of it.' },
  { tmdb: 155, rating: 8, on: '2026-08-12' },
  { tmdb: 27205, rating: 8, on: '2026-07-03' },
  { tmdb: 129, rating: 8, on: '2026-07-06' },
  { tmdb: 122, rating: 8, on: '2026-07-09' },
  { tmdb: 496243, rating: 7, on: '2026-07-12' },
  { tmdb: 13, rating: 7, on: '2026-07-15' },
  { tmdb: 389, rating: 6, on: '2026-06-01' },
  { tmdb: 769, rating: 5, on: '2026-06-04' },
  { tmdb: 372058, rating: 4, on: '2026-06-07', note: 'Pretty, and it lost me completely.' },
]

// All rated 8, so they land on a shelf that already exists. The flat grid has
// to add four rows for them; the shelf just gets longer sideways.
const MORE = [11, 105, 218, 601, 620, 78, 289, 597, 862, 12, 585, 274]

/** The rendered text of one log row, matched by the film on it. */
const rowsText = (page, pattern) =>
  page.locator('main li:visible').filter({ hasText: pattern }).first().innerText()

const email = `fs-prof-${Math.floor(Math.random() * 1e9)}@example.com`
const password = 'test-password-12345'
const username = `prof_${Math.floor(Math.random() * 1e6)}`

const { data: made, error: mkErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username },
})
if (mkErr) throw new Error(mkErr.message)

const seed = createClient(URL_, ANON, { auth: { persistSession: false } })
await seed.auth.signInWithPassword({ email, password })

console.log(`\nseeding ${SEED.length} films…`)
for (const s of SEED) {
  const { data: cat, error } = await seed.functions.invoke('catalog', {
    body: { tmdbId: s.tmdb, mediaType: 'movie', language: 'en', country: 'DK' },
  })
  if (error || !cat?.id) throw new Error(`catalog ${s.tmdb}: ${error?.message}`)

  const { data: entry } = await seed
    .from('log_entries')
    .insert({ title_id: cat.id, rating: s.rating, watched_on: s.on })
    .select('id')
    .single()

  if (s.note) await seed.from('entry_notes').insert({ entry_id: entry.id, body: s.note })
}

const distinctScores = new Set(SEED.map((s) => s.rating)).size

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.locator('article h2:visible').first().waitFor({ timeout: 90_000 })

  // ---- the log: months and folded notes -----------------------------------
  await page.locator('nav button:visible', { hasText: /^me$/i }).first().click()
  await page.locator('text=/your log/i').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)

  const monthHeads = await page
    .locator('section h3:visible')
    .filter({ hasText: /2026/ })
    .allInnerTexts()
  check('the log is grouped by month', monthHeads.length === 3, monthHeads.join(' | '))

  // The seed is inserted newest-watched FIRST, so created_at order is the exact
  // reverse of watched_on order. Grouping by one while sorting by the other put
  // the months backwards — and because only neighbouring rows merge, a month
  // could appear twice. The old check counted three headings and was happy.
  check(
    'months run newest first',
    JSON.stringify(monthHeads.map((m) => m.trim())) ===
      JSON.stringify(['AUGUST 2026', 'JULY 2026', 'JUNE 2026']),
    monthHeads.join(' | '),
  )
  check('no month appears twice', new Set(monthHeads).size === monthHeads.length)

  const fightClub = await rowsText(page, /Fight Club/i)
  // type-meta uppercases, so a note styled with it previews as SHOUTING.
  check(
    'the note preview keeps its own case',
    fightClub.includes('The soap plot is the best of it.'),
    fightClub.replace(/\s+/g, ' ').trim(),
  )
  check('no raw ISO dates on a row', !/\d{4}-\d{2}-\d{2}/.test(fightClub))

  const rows = page.locator('main li:visible')
  check('every viewing is listed', (await rows.count()) === SEED.length, `${await rows.count()}`)

  // The note is folded into the meta line, so its text is present but the
  // delete control it sits with is not — that is what "folded" has to mean.
  const deleteVisible = await page.locator('text=/^delete$/i').count()
  check('no delete buttons until a row is opened', deleteVisible === 0, `${deleteVisible} shown`)

  await rows.filter({ hasText: /Fight Club/i }).locator('button').nth(1).click()
  await page.waitForTimeout(600)
  check(
    'opening a row reveals the note and delete',
    (await page.locator('text=/^delete$/i').count()) === 1 &&
      (await page.locator('text=/soap plot/i').count()) > 0,
  )

  const logHeight = await page.evaluate(() => document.body.scrollHeight)

  // ---- the profile: shelves ------------------------------------------------
  await page.locator('button:visible', { hasText: /my profile/i }).first().click()
  await page.locator('text=/see all/i').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)

  const shelfLabels = await page.locator('section h3:visible').allInnerTexts()
  check(
    'one shelf per score given',
    shelfLabels.length === distinctScores,
    `${shelfLabels.length} shelves: ${shelfLabels.join(', ')}`,
  )
  check('highest score first', shelfLabels[0]?.trim() === '10', shelfLabels[0])

  // The fullest shelf must actually overflow, or the sideways scroll is a lie.
  const overflow = await page.evaluate(() => {
    const shelves = [...document.querySelectorAll('[role="group"]')]
    return shelves.map((s) => s.scrollWidth - s.clientWidth)
  })
  check('the fullest shelf scrolls sideways', Math.max(...overflow) > 0, `+${Math.max(...overflow)}px`)

  const profileHeight = await page.evaluate(() => document.body.scrollHeight)

  // ---- tapping a poster must open the film --------------------------------
  await page.locator('[role="group"] button').first().click()
  await page.waitForTimeout(2500)
  const onTitlePage = await page.locator('button[aria-label="Back"]:visible').count()
  const synopsis = await page.locator('text=/synopsis/i').count()
  check('tapping a poster opens the title page', synopsis > 0, `back=${onTitlePage} synopsis=${synopsis}`)
  if (synopsis > 0) {
    await page.locator('button[aria-label="Back"]:visible').first().click()
    await page.waitForTimeout(1200)
  }

  // ---- see all: the full collection ---------------------------------------
  await page.locator('button:visible', { hasText: /see all/i }).first().click()
  await page.locator('input[type="search"]:visible').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)

  const tiles = page.locator('main ul li:visible')
  check('the collection holds everything', (await tiles.count()) === SEED.length, `${await tiles.count()}`)

  const collectionHeight = await page.evaluate(() => document.body.scrollHeight)

  await page.locator('input[type="search"]:visible').fill('god')
  await page.waitForTimeout(800)
  const filtered = await tiles.count()
  check('search narrows it', filtered > 0 && filtered < SEED.length, `${filtered} match(es)`)

  await page.locator('input[type="search"]:visible').fill('')
  await page.waitForTimeout(600)
  await page.locator('button:visible', { hasText: /^a–z$/i }).first().click()
  await page.waitForTimeout(800)
  const alpha = await tiles.locator('p').allInnerTexts()
  const sorted = [...alpha].sort((a, b) => a.localeCompare(b, 'en'))
  check('sorting A–Z actually sorts', JSON.stringify(alpha) === JSON.stringify(sorted), alpha[0])

  // ---- the whole point: what happens when the collection gets big? --------
  //
  // Being shorter at fourteen films was never the goal — fourteen films are
  // not crowded. The goal is that the profile stops growing while the flat
  // grid keeps going, so this seeds another batch into a band that already
  // exists and measures both again.
  console.log(`\nseeding ${MORE.length} more films…`)
  let added = 0
  for (const tmdb of MORE) {
    const { data: cat } = await seed.functions.invoke('catalog', {
      body: { tmdbId: tmdb, mediaType: 'movie', language: 'en', country: 'DK' },
    })
    if (!cat?.id) continue
    const { error } = await seed
      .from('log_entries')
      .insert({ title_id: cat.id, rating: 8, watched_on: '2026-05-02' })
    if (!error) added++
  }
  check('the second batch seeded', added >= 8, `${added} of ${MORE.length}`)

  // A reload lands on the Lobby — navigation lives in state, not the URL — so
  // walk back to the profile rather than assuming the screen survived.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('article h2:visible').first().waitFor({ timeout: 90_000 })
  await page.locator('nav button:visible', { hasText: /^me$/i }).first().click()
  await page.locator('button:visible', { hasText: /my profile/i }).first().click()
  await page.locator('text=/see all/i').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const grownProfile = await page.evaluate(() => document.body.scrollHeight)

  await page.locator('button:visible', { hasText: /see all/i }).first().click()
  await page.locator('input[type="search"]:visible').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const grownGrid = await page.evaluate(() => document.body.scrollHeight)

  const profileGrowth = grownProfile - profileHeight
  const gridGrowth = grownGrid - collectionHeight
  check(
    'the profile barely grows while the grid keeps going',
    profileGrowth * 4 < gridGrowth,
    `profile +${profileGrowth}px vs grid +${gridGrowth}px for ${added} more films`,
  )

  console.log(`\n  ${SEED.length} films — log ${logHeight}px · profile ${profileHeight}px · flat grid ${collectionHeight}px`)
  console.log(`  ${SEED.length + added} films — profile ${grownProfile}px · flat grid ${grownGrid}px\n`)

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (err) {
  console.log(`\nTHREW: ${err.message}`)
  await page.screenshot({ path: 'profile-failure.png', fullPage: true }).catch(() => {})
  console.log('screenshot: profile-failure.png')
  fail++
} finally {
  await browser.close()
  await admin.auth.admin.deleteUser(made.user.id)
  console.log(`${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
