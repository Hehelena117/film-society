/**
 * The reading profile, in a real browser.
 *
 * Two things worth checking beyond "it renders": that a cover tapped on a
 * profile actually opens the book — the film side had exactly this bug, where
 * the profile below outranked the title page and the posters were dead to the
 * touch — and that the score shelves match the ratings seeded.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-reading-profile.mjs
 *
 * Assumes the dev server is already running on :5173.
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

import { sweepTestUsers } from './sweep-test-users.mjs'

const env = (k) =>
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${k}=`))
    ?.slice(k.length + 1)
    .trim()

const URL_ = process.env.VITE_SUPABASE_URL ?? env('VITE_SUPABASE_URL')
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? env('VITE_SUPABASE_ANON_KEY')
const APP = process.env.APP_URL ?? 'http://localhost:5173'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
await sweepTestUsers(admin)

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

// Scores chosen to make three distinct shelves.
const SEED = [
  ['OL27448W', 9],
  ['OL45804W', 9],
  ['OL46125W', 8],
  ['OL15626917W', 6],
]

const email = `fs-prof-${Math.floor(Math.random() * 1e9)}@example.com`
const password = 'test-password-12345'
const { data: made } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username: `read_${Math.floor(Math.random() * 1e6)}` },
})

const seed = createClient(URL_, ANON, { auth: { persistSession: false } })
await seed.auth.signInWithPassword({ email, password })

let seeded = 0
const scores = []
for (const [olKey, rating] of SEED) {
  const { data: book } = await seed.functions.invoke('books', { body: { olKey, language: 'en' } })
  if (!book?.id) continue
  const { error } = await seed.from('book_log_entries').insert({ book_id: book.id, rating })
  if (!error) {
    seeded++
    scores.push(rating)
  }
}
check('seeded some rated books', seeded >= 3, `${seeded} of ${SEED.length}`)

const expectedShelves = new Set(scores).size

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  const door = page.getByRole('button', { name: /book society/i }).first()
  await door.waitFor({ timeout: 60_000 })
  await door.click()

  await page.locator('nav button:visible', { hasText: /^me$/i }).first().waitFor({ timeout: 60_000 })
  await page.locator('nav button:visible', { hasText: /^me$/i }).first().click()

  await page.locator('button:visible', { hasText: /my reading/i }).first().click()
  await page.locator('text=/what they have read/i').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)

  const shelfLabels = await page.locator('main section h3:visible').allInnerTexts()
  check(
    'one shelf per score given',
    shelfLabels.length === expectedShelves,
    `${shelfLabels.length} shelves: ${shelfLabels.join(', ')} (expected ${expectedShelves})`,
  )
  check('best score first', shelfLabels[0]?.trim() === String(Math.max(...scores)), shelfLabels[0])

  const covers = page.locator('main section [role="group"] button')
  check('covers are on the shelves', (await covers.count()) >= seeded, `${await covers.count()}`)

  // The film side's bug: openTitle sat below the profile, so a tapped poster
  // set state and changed nothing on screen.
  await covers.first().click()
  await page.waitForTimeout(2500)
  const onBookPage = await page.locator('text=/where you are/i').count()
  check(
    'tapping a cover opens the book',
    onBookPage > 0,
    onBookPage > 0 ? 'book page shown' : 'nothing happened',
  )

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (err) {
  console.log(`\nTHREW: ${err.message}`)
  await page.screenshot({ path: 'reading-profile-failure.png' }).catch(() => {})
  fail++
} finally {
  await browser.close()
  await admin.auth.admin.deleteUser(made.user.id)
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
