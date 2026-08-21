import type { Side } from '@/lib/side'

/**
 * Four rooms per side.
 *
 * The two sets share every token name, so a component written for one works
 * unchanged on the other — what differs is only what the tokens are set to.
 * They also share all three typefaces and the paper grain, which is what keeps
 * the book half the same age as the film half rather than a modern app in
 * different colours.
 */
export const FILM_THEMES = [
  { id: 'lobby', swatch: '#f4eddf', dot: '#8e1b22' },
  { id: 'marquee', swatch: '#f6f0e4', dot: '#4a1119' },
  { id: 'velvet', swatch: '#2a0a0f', dot: '#e8b44a' },
  { id: 'night', swatch: '#141013', dot: '#b22a2a' },
] as const

export const BOOK_THEMES = [
  { id: 'bookshop', swatch: '#f0ede5', dot: '#4a5240' },
  { id: 'readingroom', swatch: '#eef1f3', dot: '#00263e' },
  { id: 'paperback', swatch: '#f2e6b1', dot: '#594536' },
  { id: 'latenight', swatch: '#14120f', dot: '#a1ad92' },
] as const

export type FilmThemeId = (typeof FILM_THEMES)[number]['id']
export type BookThemeId = (typeof BOOK_THEMES)[number]['id']
export type ThemeId = FilmThemeId | BookThemeId

export function themesFor(side: Side): ReadonlyArray<{ id: ThemeId; swatch: string; dot: string }> {
  return side === 'book' ? BOOK_THEMES : FILM_THEMES
}

// One key per side. Sharing a key would mean walking through the door and
// finding the other room's walls, because the ids do not overlap.
const keyFor = (side: Side) => `fs.theme.${side}`

function isThemeFor(side: Side, value: string | null): value is ThemeId {
  return value !== null && themesFor(side).some((t) => t.id === value)
}

/**
 * First run: follow the OS. Someone whose machine is in dark mode almost
 * certainly does not want a cream page at them, but the darkest theme is a lot
 * of black for a first impression — so dark lands on the second-darkest, which
 * is still the old look.
 */
function preferredDefault(side: Side): ThemeId {
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  if (side === 'book') return dark ? 'latenight' : 'bookshop'
  return dark ? 'velvet' : 'lobby'
}

export function getTheme(side: Side): ThemeId {
  const stored = localStorage.getItem(keyFor(side))
  return isThemeFor(side, stored) ? stored : preferredDefault(side)
}

export function setTheme(side: Side, theme: ThemeId) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(keyFor(side), theme)
}

/** Called on entering a side, and before first paint, so nothing flashes. */
export function applyTheme(side: Side) {
  document.documentElement.dataset.theme = getTheme(side)
}
