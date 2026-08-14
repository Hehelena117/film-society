/**
 * Turns anything thrown into something worth showing a person.
 *
 * Supabase rejects with plain objects — PostgrestError, AuthError, FunctionsError
 * — none of which are Error instances. The obvious
 *   err instanceof Error ? err.message : String(err)
 * therefore renders them as "[object Object]", hiding the actual cause at
 * exactly the moment it matters.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err

  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>

    // PostgrestError carries message plus, often, a far more useful hint/detail.
    const parts = [e.message, e.details, e.hint].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    )
    if (parts.length) return [...new Set(parts)].join(' — ')

    if (typeof e.error_description === 'string') return e.error_description
    if (typeof e.error === 'string') return e.error

    try {
      return JSON.stringify(err)
    } catch {
      /* fall through */
    }
  }

  return String(err)
}
