const FILMS = 'fs.shown'
const LIMIT = 120

/**
 * Things already offered, remembered across visits.
 *
 * Without this the exclusion list started empty on every mount, so the model
 * saw an identical prompt and returned its strongest picks again — the wall
 * looked frozen even though it had genuinely refetched.
 *
 * Capped and oldest-first-out, so it eventually comes back round to things
 * rather than exhausting itself, and the prompt stays a sane length.
 *
 * Takes a key because the book shelf needs its own memory, and more than one:
 * what has been offered by title, which is the language the prompt speaks —
 * and by Open Library key, because a book comes back under a slightly
 * different title often enough that the title is not what identifies it. The
 * film side keeps its original store and its original behaviour.
 */
export function getShown(key: string = FILMS): string[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function rememberShown(names: string[], key: string = FILMS, limit = LIMIT): void {
  try {
    const merged = [...getShown(key), ...names]
    const unique = [...new Set(merged)]
    localStorage.setItem(key, JSON.stringify(unique.slice(-limit)))
  } catch {
    /* a full or blocked localStorage should not break the wall */
  }
}

export function forgetShown(key: string = FILMS): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** The book shelf's own stores. Separate worlds, separate memories. */
export const BOOK_TITLES = 'fs.book.shown.titles'
export const BOOK_KEYS = 'fs.book.shown.keys'
/** Larger than the film wall's: a shelf is browsed in longer sittings. */
export const BOOK_LIMIT = 300
