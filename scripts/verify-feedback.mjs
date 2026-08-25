/**
 * Does "more like this" / "not for me" actually steer the wall?
 *
 * The promise on the dislike button is the strong one — "never recommend this
 * again" is a claim about every future wall, not just the next one — so this
 * drives a real browser, presses the real buttons, and then reshuffles several
 * times checking the turned-down title never reappears.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-feedback.mjs
 *
 * Assumes the dev server is already running on :5173.
 */

import { chromium } from 'playwright'
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
const APP = process.env.APP_URL ?? 'http://localhost:5173'

if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

// Clears anything a previous run left behind before adding more.
await sweepTestUsers(admin)

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

const email = `fs-fb-${Math.floor(Math.random() * 1e9)}@example.com`
const password = 'test-password-12345'
const username = `fb_${Math.floor(Math.random() * 1e6)}`

const { data: made, error: mkErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username },
})
if (mkErr) throw new Error(mkErr.message)

const rows = async () => {
  const { data } = await admin
    .from('recommendation_feedback')
    .select('name, verdict, user_id, tmdb_id')
    .eq('user_id', made.user.id)
  return data ?? []
}

/**
 * Walk through the film door.
 *
 * Every account now meets the chooser on its first login, so a suite that
 * signs in and waits for the Lobby waits forever. Harmless if the chooser is
 * not there — an existing account goes straight through.
 */
async function enterFilmSide(page) {
  const door = page.getByRole('button', { name: /film society/i }).first()
  try {
    await door.waitFor({ timeout: 15_000 })
    await door.click()
  } catch {
    // Already inside.
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const payloads = []
page.on('request', (r) => {
  if (r.url().includes('/functions/v1/recommend')) payloads.push(r.postData() ?? '')
})

// Kept so an empty wall can be explained rather than guessed at.
const responses = []
page.on('response', async (r) => {
  if (!r.url().includes('/functions/v1/recommend')) return
  try {
    responses.push({ status: r.status(), body: (await r.text()).slice(0, 600) })
  } catch {
    responses.push({ status: r.status(), body: '(unreadable)' })
  }
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await enterFilmSide(page)

  const cards = page.locator('article:visible')
  await cards.first().locator('h2').waitFor({ timeout: 90_000 })

  const first = cards.nth(0)
  const second = cards.nth(1)
  const rejectedName = await first.locator('h2').innerText()
  const likedName = await second.locator('h2').innerText()

  // ---- press "not for me" -------------------------------------------------
  await first.locator('button', { hasText: /^not for me/i }).click()
  await page.locator('text=/won.t be recommended again/i').first().waitFor({ timeout: 15_000 })
  check('the card says it will not come back', true, rejectedName)

  await page.waitForTimeout(1500)
  let saved = await rows()
  check(
    'the dislike is stored',
    saved.some((r) => r.name === rejectedName && r.verdict === 'less'),
    saved.map((r) => `${r.name}=${r.verdict}`).join(', ') || 'nothing stored',
  )
  // The exact trap that once broke watchlists: an upsert does not fire column
  // DEFAULTs, so a row can land with a NULL owner and belong to nobody.
  check(
    'the row has an owner, not null',
    saved.length > 0 && saved.every((r) => r.user_id === made.user.id),
  )

  // ---- press "more like this" ---------------------------------------------
  await second.locator('button', { hasText: /^more like this/i }).click()
  await page.waitForTimeout(1500)
  saved = await rows()
  check(
    'the like is stored',
    saved.some((r) => r.name === likedName && r.verdict === 'more'),
    saved.map((r) => `${r.name}=${r.verdict}`).join(', '),
  )

  // ---- press it again to clear it -----------------------------------------
  await second.locator('button', { hasText: /^more like this/i }).click()
  await page.waitForTimeout(1500)
  saved = await rows()
  check(
    'pressing again clears the verdict',
    !saved.some((r) => r.name === likedName),
    `${saved.length} row(s) left`,
  )

  // Put it back, so the prompt has something to aim at.
  await second.locator('button', { hasText: /^more like this/i }).click()
  await page.waitForTimeout(1500)

  // ---- reshuffle: does the rejection actually hold? -----------------------
  const walls = []
  for (let round = 1; round <= 3; round++) {
    const before = payloads.length
    await page
      .locator('button:visible', { hasText: /show me something else/i })
      .first()
      .click()
    await page.waitForTimeout(2000)
    await cards.first().locator('h2').waitFor({ timeout: 90_000 })
    await page.waitForTimeout(1500)

    const sent = payloads.slice(before).join('\n')
    check(
      `round ${round}: the rejected title is in the exclusion list`,
      sent.includes(rejectedName),
    )
    check(`round ${round}: the liked title is sent as a target`, sent.includes(likedName))

    const wall = await cards.locator('h2').allInnerTexts()
    walls.push(wall)
    check(`round ${round}: the rejected title is not on the wall`, !wall.includes(rejectedName))
  }

  // ---- and it survives a reload -------------------------------------------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await cards.first().locator('h2').waitFor({ timeout: 90_000 })
  const afterReload = await cards.locator('h2').allInnerTexts()
  check('after a reload it is still rejected', !afterReload.includes(rejectedName))
  walls.push(afterReload)

  console.log(`\n  turned down: ${rejectedName}`)
  console.log(`  asked for more like: ${likedName}`)
  walls.forEach((w, i) => console.log(`  wall ${i + 1}: ${w.join(', ')}`))
  console.log('')

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (err) {
  console.log(`\nTHREW: ${err.message}`)
  const last = responses[responses.length - 1]
  if (last) console.log(`last recommend response: ${last.status} ${last.body}`)
  await page.screenshot({ path: 'feedback-failure.png' }).catch(() => {})
  console.log('screenshot: feedback-failure.png')
  fail++
} finally {
  await browser.close()
  await admin.auth.admin.deleteUser(made.user.id)
  console.log(`${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
