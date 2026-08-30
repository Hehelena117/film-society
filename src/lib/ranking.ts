/**
 * Ranking a shelf by asking as few questions as possible.
 *
 * Binary insertion: the books already placed are in order, so a new book only
 * has to be compared against the middle of that order, then the middle of
 * whichever half survives. Each answer halves the remaining possibilities,
 * which is what makes it a decision tree rather than a list of every pair.
 *
 * Ten books cost about 22 choices; every possible pair would be 45. Twenty
 * books cost about 62 against 190.
 *
 * Deliberately pure and synchronous — no network, no React. The whole point is
 * that it can be checked by running it, and it is: scripts/verify-ranking.mjs
 * ranks shuffled lists against a known order and counts the questions.
 */

export interface RankingState<T> {
  /** In order, best first. */
  placed: T[]
  /** Still to be placed, in the order they will be offered. */
  waiting: T[]
  /** The one being placed right now. */
  inserting: T | null
  /** The slice of `placed` it could still belong in. */
  lo: number
  hi: number
}

export function startRanking<T>(items: T[]): RankingState<T> {
  if (items.length === 0) return { placed: [], waiting: [], inserting: null, lo: 0, hi: 0 }

  // The first book needs no comparison — with nothing to compare against it is
  // already a complete ranking of one.
  const [first, ...rest] = items
  return beginNext({ placed: [first], waiting: rest, inserting: null, lo: 0, hi: 1 })
}

function beginNext<T>(state: RankingState<T>): RankingState<T> {
  if (state.waiting.length === 0) return { ...state, inserting: null }
  const [next, ...rest] = state.waiting
  return { ...state, inserting: next, waiting: rest, lo: 0, hi: state.placed.length }
}

/** The pair to put in front of someone, or null when there is nothing left to ask. */
export function nextPair<T>(state: RankingState<T>): { left: T; right: T } | null {
  if (!state.inserting || state.lo >= state.hi) return null
  const mid = Math.floor((state.lo + state.hi) / 2)
  return { left: state.inserting, right: state.placed[mid] }
}

/**
 * Records an answer and returns the state that follows.
 *
 * `preferredLeft` means they would rather read the book being placed than the
 * one it was shown against.
 */
export function choose<T>(state: RankingState<T>, preferredLeft: boolean): RankingState<T> {
  if (!state.inserting) return state

  const mid = Math.floor((state.lo + state.hi) / 2)
  // Preferring the new book means it belongs somewhere above the midpoint;
  // preferring the placed one means below it.
  const next = preferredLeft ? { ...state, hi: mid } : { ...state, lo: mid + 1 }

  if (next.lo < next.hi) return next

  // Its place is settled.
  const placed = [...next.placed]
  placed.splice(next.lo, 0, next.inserting as T)
  return beginNext({ ...next, placed, inserting: null })
}

export const isFinished = <T>(state: RankingState<T>) =>
  state.inserting === null && state.waiting.length === 0

/** How many comparisons are still to come, at most. Drives the progress line. */
export function questionsLeft<T>(state: RankingState<T>): number {
  const forCurrent = state.inserting ? Math.ceil(Math.log2(Math.max(1, state.hi - state.lo + 1))) : 0
  let total = forCurrent
  let size = state.placed.length + (state.inserting ? 1 : 0)
  for (let i = 0; i < state.waiting.length; i++) {
    total += Math.ceil(Math.log2(size + 1))
    size++
  }
  return total
}

/**
 * The group's order: best average position first.
 *
 * Averaged over the people who ranked, and books everybody judged come
 * before books only some did — otherwise one person's lone first choice
 * (1.0) beats a book three people all put second (2.0), which is the
 * opposite of finding what the group agrees on.
 *
 * Every tie is broken by something, all the way down, because this has to
 * give the same answer on every phone and on every refresh. It did not:
 * two people who disagree completely produce a genuine tie on average, and
 * the winner then came down to whatever order the rows arrived in, so the
 * screen showed one book and then another. After the average, the book more
 * people put first wins; after that, the one fewer people put last; and
 * finally the lower id, which decides nothing but decides it consistently.
 */
export function bestAveragePosition(
  rankings: Array<{ userId: string; bookId: number; position: number }>,
): Array<{ bookId: number; average: number; voters: number; firsts: number }> {
  const byBook = new Map<number, number[]>()
  for (const r of rankings) {
    byBook.set(r.bookId, [...(byBook.get(r.bookId) ?? []), r.position])
  }

  // The longest ranking anybody filed: last place in a deck of ten is tenth.
  const last = Math.max(0, ...rankings.map((r) => r.position))

  const scored = [...byBook.entries()].map(([bookId, positions]) => ({
    bookId,
    average: positions.reduce((a, b) => a + b, 0) / positions.length,
    voters: positions.length,
    firsts: positions.filter((p) => p === 1).length,
    lasts: positions.filter((p) => p === last).length,
  }))

  const most = Math.max(0, ...scored.map((s) => s.voters))

  const order = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    a.average - b.average || b.firsts - a.firsts || a.lasts - b.lasts || a.bookId - b.bookId

  return [
    ...scored.filter((s) => s.voters === most).sort(order),
    ...scored.filter((s) => s.voters < most).sort(order),
  ].map(({ bookId, average, voters, firsts }) => ({ bookId, average, voters, firsts }))
}
