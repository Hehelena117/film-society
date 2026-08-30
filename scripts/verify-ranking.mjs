/**
 * Does the decision tree actually rank, and in how many questions?
 *
 *   npm run verify:ranking
 *
 * No database and no browser: the ranking is pure code, so it can be checked
 * by running it thousands of times against known orders. If this passes, any
 * wrong order on screen is a wiring fault and not the algorithm.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// TypeScript, so compile it rather than reimplementing it here — a test that
// reimplements what it is testing proves only that two guesses agree.
const out = mkdtempSync(join(tmpdir(), 'ranking-'))
// The local tsc binary, run by this same Node. Spawning npx.cmd from Node on
// Windows fails with EINVAL, and going through a shell to dodge that is a
// worse trade than naming the binary.
execFileSync(
  process.execPath,
  [
    join('node_modules', 'typescript', 'bin', 'tsc'),
    'src/lib/ranking.ts',
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
const { startRanking, nextPair, choose, isFinished, questionsLeft, bestAveragePosition } =
  await import(pathToFileURL(join(out, 'ranking.js')).href)

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

const shuffle = (a) => {
  const c = [...a]
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[c[i], c[j]] = [c[j], c[i]]
  }
  return c
}

/**
 * Answers every question according to a secret true order, so the result can
 * be compared against something rather than merely inspected.
 */
function rankWith(items, truth) {
  let state = startRanking(items)
  let asked = 0
  let pair
  while ((pair = nextPair(state))) {
    asked++
    if (asked > 500) throw new Error('the tree never terminated')
    state = choose(state, truth.indexOf(pair.left) < truth.indexOf(pair.right))
  }
  return { order: state.placed, asked, finished: isFinished(state) }
}

console.log('\n=== does it produce the right order? ===')
let worstAsked = 0
let allCorrect = true
for (let trial = 0; trial < 2000; trial++) {
  const size = 2 + Math.floor(Math.random() * 14)
  const truth = Array.from({ length: size }, (_, i) => `book${i}`)
  const { order, asked, finished } = rankWith(shuffle(truth), truth)
  if (!finished || JSON.stringify(order) !== JSON.stringify(truth)) {
    allCorrect = false
    console.log('    mismatch at size', size, order.join(','))
    break
  }
  if (size === 10) worstAsked = Math.max(worstAsked, asked)
}
check('2000 shuffled lists all come back in the right order', allCorrect)

console.log('\n=== how many questions? ===')
const counts = []
for (let trial = 0; trial < 400; trial++) {
  const truth = Array.from({ length: 10 }, (_, i) => `book${i}`)
  counts.push(rankWith(shuffle(truth), truth).asked)
}
const avg = counts.reduce((a, b) => a + b, 0) / counts.length
const max = Math.max(...counts)
// Every possible pair of ten books is 45. The tree must be far under that.
check('ten books cost well under the 45 of every pair', max < 30, `worst ${max}, average ${avg.toFixed(1)}`)

const one = rankWith(['only'], ['only'])
check('a single book needs no questions at all', one.asked === 0 && one.order.length === 1)

const two = rankWith(['a', 'b'], ['a', 'b'])
check('two books need exactly one', two.asked === 1, `${two.asked}`)

console.log('\n=== the estimate shown on screen ===')
let s = startRanking(Array.from({ length: 10 }, (_, i) => `b${i}`))
const firstEstimate = questionsLeft(s)
let actual = 0
let p
while ((p = nextPair(s))) {
  actual++
  s = choose(s, Math.random() < 0.5)
}
check(
  'the remaining count is an over-estimate, never an under',
  firstEstimate >= actual,
  `promised at most ${firstEstimate}, took ${actual}`,
)

console.log('\n=== the group answer ===')
// Two people agree on the winner; a third prefers something else.
const winner = bestAveragePosition([
  { userId: 'a', bookId: 1, position: 1 },
  { userId: 'a', bookId: 2, position: 2 },
  { userId: 'b', bookId: 1, position: 1 },
  { userId: 'b', bookId: 2, position: 2 },
  { userId: 'c', bookId: 2, position: 1 },
  { userId: 'c', bookId: 1, position: 2 },
])
check('the book two of three put first wins', winner[0].bookId === 1, `avg ${winner[0].average.toFixed(2)}`)

// Everyone ranked a middling book; one person adores an obscure one.
const middle = bestAveragePosition([
  { userId: 'a', bookId: 10, position: 2 },
  { userId: 'b', bookId: 10, position: 2 },
  { userId: 'c', bookId: 10, position: 2 },
  { userId: 'a', bookId: 20, position: 1 },
])
check(
  'a book one person adores does not beat one everyone likes',
  middle[0].bookId === 10,
  `${middle.map((m) => `${m.bookId}:${m.average.toFixed(1)}/${m.voters}`).join(' ')}`,
)

console.log('\n=== the same answer every time ===')
// The bug this exists for: two people who disagree completely tie on
// average, the rows came back from the database in no particular order, and
// the winner was whichever one happened to be first. The screen showed one
// book, then the other.
const disagree = [
  { userId: 'a', bookId: 7, position: 1 },
  { userId: 'a', bookId: 3, position: 2 },
  { userId: 'b', bookId: 3, position: 1 },
  { userId: 'b', bookId: 7, position: 2 },
]


const answers = new Set()
for (let i = 0; i < 500; i++) {
  answers.add(bestAveragePosition(shuffle(disagree)).map((r) => r.bookId).join(">"))
}
check(
  'a dead tie still gives one answer, in any row order',
  answers.size === 1,
  `${answers.size} different answers: ${[...answers].join(" | ")}`,
)

// A three-way pile-up, ranked by three people in every order they could
// have arrived in.
const messy = [
  { userId: 'a', bookId: 1, position: 1 },
  { userId: 'a', bookId: 2, position: 2 },
  { userId: 'a', bookId: 3, position: 3 },
  { userId: 'b', bookId: 2, position: 1 },
  { userId: 'b', bookId: 3, position: 2 },
  { userId: 'b', bookId: 1, position: 3 },
  { userId: 'c', bookId: 3, position: 1 },
  { userId: 'c', bookId: 1, position: 2 },
  { userId: 'c', bookId: 2, position: 3 },
]
const messyAnswers = new Set()
for (let i = 0; i < 500; i++) {
  messyAnswers.add(bestAveragePosition(shuffle(messy)).map((r) => r.bookId).join(">"))
}
check(
  'three people in a perfect circle still settle on one order',
  messyAnswers.size === 1,
  `${messyAnswers.size} different answers`,
)

// And the tie is broken by something a person would recognise as a reason.
const firsts = bestAveragePosition([
  { userId: 'a', bookId: 5, position: 1 },
  { userId: 'a', bookId: 6, position: 3 },
  { userId: 'b', bookId: 5, position: 1 },
  { userId: 'b', bookId: 6, position: 3 },
  { userId: 'c', bookId: 6, position: 1 },
  { userId: 'c', bookId: 5, position: 3 },
  { userId: 'd', bookId: 6, position: 1 },
  { userId: 'd', bookId: 5, position: 3 },
])
check(
  'a tie on average is broken by who was put first more often',
  firsts[0].average === firsts[1].average && firsts[0].firsts === 2,
  `${firsts.map((f) => `${f.bookId}:${f.average.toFixed(1)}/${f.firsts}`).join(" ")}`,
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
