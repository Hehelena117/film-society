/**
 * Two memories, one file, and the film side unchanged.
 *
 *   node scripts/verify-shown.mjs
 *
 * The book shelf was repeating itself because it never remembered anything
 * across a visit — the fix the film wall already had. Rather than a second
 * copy of it, shown.ts took a key parameter, which is exactly the change that
 * can silently move the film wall's store or its cap and nobody would notice
 * until the wall started looking frozen again.
 *
 * No database and no browser: this is localStorage and set arithmetic.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const out = mkdtempSync(join(tmpdir(), 'shown-'))
execFileSync(
  process.execPath,
  [
    join('node_modules', 'typescript', 'bin', 'tsc'),
    'src/lib/shown.ts',
    '--outDir',
    out,
    '--target',
    'es2022',
    '--module',
    'esnext',
    '--moduleResolution',
    'bundler',
    '--skipLibCheck',
  ],
  { stdio: 'pipe' },
)

// A localStorage that behaves like the real one, including throwing when full.
const store = new Map()
let jammed = false
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    if (jammed) throw new Error('QuotaExceededError')
    store.set(k, v)
  },
  removeItem: (k) => store.delete(k),
}

const { getShown, rememberShown, forgetShown, BOOK_TITLES, BOOK_KEYS, BOOK_LIMIT } = await import(
  pathToFileURL(join(out, 'shown.js')).href
)

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('=== the film wall, exactly as it was ===')

rememberShown(['Solaris', 'Stalker'])
check('remembers with no key given', getShown().join() === 'Solaris,Stalker')
check('writes to the original store', store.has('fs.shown'), [...store.keys()].join(', '))

// The wall's cap is 120 and must stay 120.
forgetShown()
rememberShown(Array.from({ length: 200 }, (_, i) => `Film ${i}`))
check('still capped at 120', getShown().length === 120, `${getShown().length}`)
check(
  'and drops the oldest, not the newest',
  getShown()[0] === 'Film 80' && getShown().at(-1) === 'Film 199',
  `${getShown()[0]} … ${getShown().at(-1)}`,
)

console.log('\n=== the book shelf, its own memory ===')

forgetShown()
rememberShown(['Piranesi'], BOOK_TITLES, BOOK_LIMIT)
rememberShown(['OL1W'], BOOK_KEYS, BOOK_LIMIT)

check('a book title does not land in the film store', getShown().length === 0, getShown().join())
check('titles and keys are kept apart', getShown(BOOK_TITLES).join() === 'Piranesi')
check('keys are their own store', getShown(BOOK_KEYS).join() === 'OL1W')

rememberShown(
  Array.from({ length: 400 }, (_, i) => `OL${i}W`),
  BOOK_KEYS,
  BOOK_LIMIT,
)
check(
  'the shelf remembers more than the wall',
  getShown(BOOK_KEYS).length === BOOK_LIMIT && BOOK_LIMIT > 120,
  `${getShown(BOOK_KEYS).length} of ${BOOK_LIMIT}`,
)

console.log('\n=== when the browser will not play ===')

// Private browsing, a full disk, storage switched off. The shelf must still
// work; it just stops remembering.
jammed = true
let threw = false
try {
  rememberShown(['Anything'], BOOK_TITLES, BOOK_LIMIT)
} catch {
  threw = true
}
check('a jammed localStorage does not break the shelf', !threw)
jammed = false

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
