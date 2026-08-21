/**
 * Does the Lobby actually stay put?
 *
 * Counts calls to the recommend function while driving a real browser through
 * the exact journeys that were reported as broken. Structural reasoning said
 * the wall could not rebuild; it rebuilt anyway. This watches instead.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-lobby.mjs
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

const email = `fs-lobby-${Math.floor(Math.random() * 1e9)}@example.com`
const password = 'test-password-12345'
const username = `lobby_${Math.floor(Math.random() * 1e6)}`

const { data: made, error: mkErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username },
})
if (mkErr) throw new Error(mkErr.message)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

let recommendCalls = 0
page.on('request', (r) => {
  if (r.url().includes('/functions/v1/recommend')) recommendCalls++
})

const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })

  // ---- sign in ------------------------------------------------------------
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Everything is scoped to :visible. The hidden Lobby stays in the DOM by
  // design, so an unscoped selector matches it even when a title page is up —
  // which is exactly how the first run of this script failed.
  const wallTitles = page.locator('article h2:visible')
  const back = page.locator('button[aria-label="Back"]:visible')

  await wallTitles.first().waitFor({ timeout: 90_000 })
  const afterLoad = recommendCalls
  const firstWall = await wallTitles.allInnerTexts()
  check('lobby loaded', firstWall.length > 0, `${firstWall.length} titles, ${afterLoad} call(s)`)

  // ---- journey 1: open a title, come back ---------------------------------
  await page.locator('article img:visible, article [class*="aspect-2/3"]:visible').first().click()
  await back.waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await back.click()
  await wallTitles.first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)

  const afterTitle = recommendCalls
  const wallAfterTitle = await wallTitles.allInnerTexts()
  check(
    'opening a title does not refetch',
    afterTitle === afterLoad,
    `${afterLoad} -> ${afterTitle} calls`,
  )
  check(
    'the same wall came back',
    wallAfterTitle[0] === firstWall[0],
    `${firstWall[0]} -> ${wallAfterTitle[0]}`,
  )

  // ---- journey 2: switch tabs, come back ----------------------------------
  await page.locator('nav button:visible', { hasText: /^lists$/i }).first().click()
  await page.waitForTimeout(1200)
  await page.locator('nav button:visible', { hasText: /^lobby$/i }).first().click()
  await page.waitForTimeout(1500)

  const afterTabs = recommendCalls
  const wallAfterTabs = await wallTitles.allInnerTexts()
  check(
    'switching tabs does not refetch',
    afterTabs === afterLoad,
    `${afterLoad} -> ${afterTabs} calls`,
  )
  check(
    'the same wall came back again',
    wallAfterTabs[0] === firstWall[0],
    `${firstWall[0]} -> ${wallAfterTabs[0]}`,
  )

  // ---- journey 3: the button SHOULD change it -----------------------------
  await page.locator('button:visible', { hasText: /show me something else/i }).first().click()
  await page.waitForTimeout(2000)
  await wallTitles.first().waitFor({ timeout: 90_000 })
  await page.waitForTimeout(1500)

  const afterReshuffle = recommendCalls
  const reshuffled = await wallTitles.allInnerTexts()
  check(
    'the button does refetch',
    afterReshuffle > afterTabs,
    `${afterTabs} -> ${afterReshuffle} calls`,
  )
  check(
    'and the wall actually changed',
    reshuffled[0] !== firstWall[0],
    `${firstWall[0]} -> ${reshuffled[0]}`,
  )

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (err) {
  console.log(`\nTHREW: ${err.message}`)
  await page.screenshot({ path: 'lobby-failure.png' }).catch(() => {})
  console.log('screenshot: lobby-failure.png')
  fail++
} finally {
  await browser.close()
  await admin.auth.admin.deleteUser(made.user.id)
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
