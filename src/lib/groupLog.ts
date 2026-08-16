import type { TFunction } from 'i18next'

import type { LoggedEntry } from '@/lib/log'

export const LOG_GROUPINGS = ['month', 'year', 'rating', 'decade', 'none'] as const
export type LogGrouping = (typeof LOG_GROUPINGS)[number]

export interface LogGroup {
  key: string
  /** null means no heading — the flat list. */
  label: string | null
  entries: LoggedEntry[]
}

export function isLogGrouping(value: unknown): value is LogGrouping {
  return typeof value === 'string' && (LOG_GROUPINGS as readonly string[]).includes(value)
}

/**
 * When a viewing happened, as a sortable string.
 *
 * watched_on is YYYY-MM-DD and created_at is an ISO timestamp that begins the
 * same way, so both compare correctly as text and no Date objects are made
 * just to put two entries in order. Falling back to the logging date because
 * an undated entry still has to sit somewhere, and the day it was written down
 * is the honest guess.
 */
const watchedOn = (e: LoggedEntry) => e.watchedOn ?? e.createdAt.slice(0, 10)

const byWatchedDesc = (a: LoggedEntry, b: LoggedEntry) =>
  watchedOn(b).localeCompare(watchedOn(a))

/**
 * Collects consecutive entries sharing a key.
 *
 * Only ever fed an already-sorted list. Grouping neighbours rather than
 * bucketing into a map is what keeps the groups in the order the sort put them
 * in — but it also means an unsorted list silently produces the same heading
 * twice, which is exactly the bug the log had when it sorted on one field and
 * grouped by another.
 */
function runs(
  entries: LoggedEntry[],
  keyOf: (e: LoggedEntry) => string,
  labelOf: (e: LoggedEntry) => string | null,
): LogGroup[] {
  const groups: LogGroup[] = []
  for (const entry of entries) {
    const key = keyOf(entry)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.entries.push(entry)
    else groups.push({ key, label: labelOf(entry), entries: [entry] })
  }
  return groups
}

/**
 * Stacks the log the way this user asked for it.
 *
 * Every mode sorts first and groups second, and the sort always agrees with
 * the key — get those out of step and a group appears twice.
 */
export function groupLog(
  entries: LoggedEntry[],
  mode: LogGrouping,
  language: string,
  t: TFunction,
): LogGroup[] {
  if (!entries.length) return []

  switch (mode) {
    case 'none':
      return [{ key: 'all', label: null, entries: [...entries].sort(byWatchedDesc) }]

    case 'year': {
      const sorted = [...entries].sort(byWatchedDesc)
      const yearOf = (e: LoggedEntry) => watchedOn(e).slice(0, 4)
      return runs(sorted, yearOf, yearOf)
    }

    case 'rating': {
      // Unrated last: an entry with no score is bookkeeping rather than an
      // opinion, and it would otherwise sort as though it were a zero.
      const sorted = [...entries].sort(
        (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byWatchedDesc(a, b),
      )
      return runs(
        sorted,
        (e) => (e.rating === null ? 'unrated' : String(e.rating)),
        (e) => (e.rating === null ? t('me.notRated') : String(e.rating)),
      )
    }

    case 'decade': {
      // The film's own decade, not the year you watched it — this is the one
      // grouping that says something about the films rather than the viewing.
      const decadeOf = (e: LoggedEntry) =>
        e.title.year === null ? null : Math.floor(e.title.year / 10) * 10

      const sorted = [...entries].sort((a, b) => {
        const [x, y] = [decadeOf(a), decadeOf(b)]
        if (x === null || y === null) return (y === null ? 0 : 1) - (x === null ? 0 : 1)
        return y - x || (b.title.year ?? 0) - (a.title.year ?? 0) || byWatchedDesc(a, b)
      })

      return runs(
        sorted,
        (e) => String(decadeOf(e) ?? 'unknown'),
        (e) => {
          const decade = decadeOf(e)
          return decade === null ? t('me.unknownYear') : t('me.decade', { decade })
        },
      )
    }

    case 'month':
    default: {
      const sorted = [...entries].sort(byWatchedDesc)
      const format = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' })
      return runs(
        sorted,
        (e) => watchedOn(e).slice(0, 7),
        (e) => format.format(new Date(watchedOn(e))),
      )
    }
  }
}
