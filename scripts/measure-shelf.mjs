/**
 * How much of a small phone does the shelf header eat?
 *
 * Open Library being down means no books render, but the header, the divider
 * and the tab bar all do — and they are what decides whether a book fits.
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

const admin = createClient(env('VITE_SUPABASE_URL'), process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
await sweepTestUsers(admin)

const email = `shot-${Math.floor(Math.random() * 1e9)}@example.com`
const password = 'test-password-12345'
const { data: made } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username: `shot_${Math.floor(Math.random() * 1e6)}` },
})

const browser = await chromium.launch()

for (const [label, width, height] of [
  ['iPhone SE     ', 375, 667],
  ['small Android ', 360, 640],
  ['iPhone 14     ', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  const door = page.getByRole('button', { name: /book society/i }).first()
  await door.waitFor({ timeout: 60_000 }).catch(() => {})
  if (await door.count()) await door.click()
  await page.locator('text=/on the shelf/i').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1200)

  const m = await page.evaluate(() => {
    const header = document.querySelector('header')
    const nav = document.querySelector('nav')
    const main = document.querySelector('main')
    const pip = [...document.querySelectorAll('span')].find((s) =>
      /on the shelf/i.test(s.textContent ?? ''),
    )
    // The books are sized by a custom property now. getComputedStyle hands
    // back the literal "clamp(...)" for a custom property rather than the
    // resolved length, so measure something that actually uses it.
    let shelfH = null
    if (main) {
      const probe = document.createElement('div')
      probe.style.height = 'var(--shelf-h)'
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      main.appendChild(probe)
      shelfH = probe.getBoundingClientRect().height
      probe.remove()
    }
    return {
      viewport: innerHeight,
      header: header ? Math.round(header.getBoundingClientRect().height) : null,
      nav: nav ? Math.round(nav.getBoundingClientRect().height) : null,
      shelfStartsAt: pip ? Math.round(pip.getBoundingClientRect().bottom) : null,
      shelfH: shelfH ? Math.round(shelfH) : null,
    }
  })

  const left = m.viewport - (m.shelfStartsAt ?? 0) - (m.nav ?? 0)
  // Books, the board under them, and the caption card beneath that.
  const needs = (m.shelfH ?? 304) + 11
  console.log(
    `${label} ${width}x${height}  header ${m.header}px  books ${m.shelfH}px  ` +
      `room ${left}px  ${left >= needs ? 'FITS' : 'TIGHT'}  (${left - needs}px spare for the caption)`,
  )
  await page.close()
}

await browser.close()
await admin.auth.admin.deleteUser(made.user.id)
