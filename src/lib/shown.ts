const KEY = 'fs.shown'
const LIMIT = 120

/**
 * Titles the Lobby has already offered, remembered across visits.
 *
 * Without this the exclusion list started empty on every mount, so the model
 * saw an identical prompt and returned its strongest picks again — the wall
 * looked frozen even though it had genuinely refetched.
 *
 * Capped and oldest-first-out, so the wall eventually comes back round to
 * things rather than exhausting itself, and the prompt stays a sane length.
 */
export function getShown(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function rememberShown(names: string[]): void {
  try {
    const merged = [...getShown(), ...names]
    const unique = [...new Set(merged)]
    localStorage.setItem(KEY, JSON.stringify(unique.slice(-LIMIT)))
  } catch {
    /* a full or blocked localStorage should not break the wall */
  }
}

export function forgetShown(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
