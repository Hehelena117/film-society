/**
 * Do notes actually reach the recommender — and only when allowed to?
 *
 * Notes are the most private thing the app holds, so this checks the promise in
 * both directions. It reads the real POST body the browser sends, rather than
 * trusting that a flag was passed correctly somewhere up the call chain:
 *
 *   1. default off — a fresh account sends no note text at all
 *   2. the setting turns it on through the real settings screen
 *   3. on — the note text is in the payload
 *   4. and the model visibly answers the note, not just the score
 *
 * Check 4 is the only one that depends on a model, so it is reported as a
 * warning rather than a failure — the plumbing is what this script guarantees.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-notes.mjs
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
const warn = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  WARN'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

// Deliberately a note that no rating could stand in for. The Godfather scored 9
// suggests crime epics; this says the opposite, so if the wall shifts towards
// quiet cinema, it shifted because of the words and nothing else.
const NOTE =
  'What actually got me was the silence. The long wordless stretches, faces ' +
  'doing the work instead of dialogue. I want more films that trust quiet and ' +
  'barely speak at all.'
// A phrase distinctive enough that finding it in a request body is proof, and
// short enough to survive the 400-character trim.
const NOTE_FINGERPRINT = 'trust quiet'
const ANSWERS_THE_NOTE = /quiet|silen|wordless|dialogue|sparse|stillness|contemplat|slow|spare/i

const email = `fs-notes-${Math.floor(Math.random() * 1e9)}@example.com`
const password = 'test-password-12345'
const username = `notes_${Math.floor(Math.random() * 1e6)}`

const { data: made, error: mkErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username },
})
if (mkErr) throw new Error(mkErr.message)

// ---- seed a log through a real signed-in client, under real RLS ------------
const seed = createClient(URL_, ANON, { auth: { persistSession: false } })
await seed.auth.signInWithPassword({ email, password })

const { data: prof } = await seed
  .from('profiles')
  .select('use_notes_for_recommendations')
  .eq('id', made.user.id)
  .single()
check('a new account defaults to notes OFF', prof?.use_notes_for_recommendations === false)

const { data: godfather } = await seed.functions.invoke('catalog', {
  body: { tmdbId: 238, mediaType: 'movie', language: 'en', country: 'DK' },
})
const { data: entry } = await seed
  .from('log_entries')
  .insert({ title_id: godfather.id, rating: 9 })
  .select('id')
  .single()
const { error: noteErr } = await seed
  .from('entry_notes')
  .insert({ entry_id: entry.id, body: NOTE })
check('seeded a rated entry with a note', !noteErr, noteErr?.message)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

/** Every recommend payload the app has sent, oldest first. */
const payloads = []
page.on('request', (r) => {
  if (r.url().includes('/functions/v1/recommend')) payloads.push(r.postData() ?? '')
})

const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Scoped :visible throughout — the Lobby stays mounted while hidden.
  const wallTitles = page.locator('article h2:visible')
  await wallTitles.first().waitFor({ timeout: 90_000 })

  // ---- 1. off by default --------------------------------------------------
  const before = payloads.join('\n')
  check(
    'with the setting off, no note text is sent',
    payloads.length > 0 && !before.includes(NOTE_FINGERPRINT),
    `${payloads.length} call(s), ${before.length} bytes`,
  )
  const wallWithout = await wallTitles.allInnerTexts()

  // ---- 2. turn it on, through the actual settings screen ------------------
  await page.locator('nav button:visible', { hasText: /^me$/i }).first().click()
  await page.locator('button:visible', { hasText: /edit profile/i }).first().click()
  const toggle = page.locator('input[type="checkbox"]:visible').first()
  await toggle.waitFor({ timeout: 30_000 })
  check('the setting is unticked to begin with', !(await toggle.isChecked()))

  await toggle.check()
  await page.locator('button:visible', { hasText: /^save$/i }).first().click()
  await page.locator('text=/^saved\\.?$/i').first().waitFor({ timeout: 30_000 })

  const { data: after } = await admin
    .from('profiles')
    .select('use_notes_for_recommendations')
    .eq('id', made.user.id)
    .single()
  check('saving the setting persists it', after?.use_notes_for_recommendations === true)

  // ---- 3. now the note should travel --------------------------------------
  await page.locator('button[aria-label="Back"]:visible').first().click()
  await page.locator('nav button:visible', { hasText: /^lobby$/i }).first().click()
  await wallTitles.first().waitFor({ timeout: 30_000 })

  const countBefore = payloads.length
  await page
    .locator('button:visible', { hasText: /show me something else/i })
    .first()
    .click()
  await page.waitForTimeout(2000)
  await wallTitles.first().waitFor({ timeout: 90_000 })
  await page.waitForTimeout(1500)

  const fresh = payloads.slice(countBefore).join('\n')
  check('the button did refetch', payloads.length > countBefore, `${payloads.length} call(s)`)
  check(
    'with the setting on, the note IS sent',
    fresh.includes(NOTE_FINGERPRINT),
    fresh.includes(NOTE_FINGERPRINT) ? 'found in payload' : 'NOT in payload',
  )

  // ---- 4. did it change the answer? ---------------------------------------
  const wallWith = await wallTitles.allInnerTexts()
  const reasons = (await page.locator('article p:visible').allInnerTexts()).join(' ')
  warn(
    'the reasons answer the note, not just the score',
    ANSWERS_THE_NOTE.test(reasons),
    ANSWERS_THE_NOTE.test(reasons) ? 'note vocabulary present' : 'no note vocabulary found',
  )

  console.log(`\n  without notes: ${wallWithout.join(', ')}`)
  console.log(`  with notes:    ${wallWith.join(', ')}\n`)

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (err) {
  console.log(`\nTHREW: ${err.message}`)
  await page.screenshot({ path: 'notes-failure.png' }).catch(() => {})
  console.log('screenshot: notes-failure.png')
  fail++
} finally {
  await browser.close()
  await admin.auth.admin.deleteUser(made.user.id)
  console.log(`${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
