export const SIDES = ['film', 'book'] as const
export type Side = (typeof SIDES)[number]

export function isSide(value: unknown): value is Side {
  return value === 'film' || value === 'book'
}

/**
 * Which half you were last in.
 *
 * Kept in localStorage as well as on the profile. The profile is the record —
 * it follows you between devices — but it arrives one round trip after the
 * page does, and a chooser that flashes up for half a second before deciding
 * you did not need it is worse than no memory at all.
 */
const KEY = 'fs.side'

export function rememberedSide(): Side | null {
  const stored = localStorage.getItem(KEY)
  return isSide(stored) ? stored : null
}

export function rememberSide(side: Side) {
  localStorage.setItem(KEY, side)
}
