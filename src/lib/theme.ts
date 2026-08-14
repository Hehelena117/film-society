export const THEMES = [
  { id: 'lobby', swatch: '#f4eddf', dot: '#8e1b22' },
  { id: 'marquee', swatch: '#f6f0e4', dot: '#4a1119' },
  { id: 'velvet', swatch: '#2a0a0f', dot: '#e8b44a' },
  { id: 'night', swatch: '#141013', dot: '#b22a2a' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

const STORAGE_KEY = 'fs.theme'
const IDS = THEMES.map((t) => t.id) as readonly string[]

function isThemeId(value: string | null): value is ThemeId {
  return value !== null && IDS.includes(value)
}

/**
 * First run: follow the OS. Someone whose machine is in dark mode almost
 * certainly does not want a cream page at them, but Night is a lot of black
 * for a first impression — so dark lands on Velvet, which is still the
 * old-cinema look.
 */
function preferredDefault(): ThemeId {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'velvet' : 'lobby'
}

export function getTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isThemeId(stored) ? stored : preferredDefault()
}

export function setTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(STORAGE_KEY, theme)
  // TODO: once accounts exist, mirror this onto the user's profile row so the
  // choice follows them between devices.
}

/** Called before first paint so the page never flashes the wrong theme. */
export function applyStoredTheme() {
  document.documentElement.dataset.theme = getTheme()
}
