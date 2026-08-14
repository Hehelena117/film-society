import { useEffect, useState } from 'react'

export const THEMES = [
  { id: 'lobby', label: 'Lobby', note: 'Warm paper', swatch: '#f4eddf', dot: '#8e1b22' },
  { id: 'marquee', label: 'Marquee', note: 'Paper + oxblood', swatch: '#f6f0e4', dot: '#4a1119' },
  { id: 'velvet', label: 'Velvet', note: 'Deep red walls', swatch: '#2a0a0f', dot: '#e8b44a' },
  { id: 'night', label: 'Night', note: 'Lights down', swatch: '#141013', dot: '#b22a2a' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

const STORAGE_KEY = 'fs.theme'

export function applyStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null
  document.documentElement.dataset.theme = stored ?? 'lobby'
}

/**
 * Temporary design-review control. Lets the four themes be compared on the
 * real app rather than in a mockup. Remove once a theme is chosen — or keep it
 * as a user setting, if we decide the choice belongs to the viewer.
 */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemeId | null) ?? 'lobby',
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0]

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <ul className="overflow-hidden rounded-lg border border-rule bg-ground shadow-frame">
          {THEMES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  setTheme(t.id)
                  setOpen(false)
                }}
                aria-current={t.id === theme}
                className={`flex w-52 items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  t.id === theme ? 'bg-ground-2' : 'hover:bg-ground-2'
                }`}
              >
                <span
                  className="size-6 shrink-0 rounded-full border border-rule-strong"
                  style={{ background: `linear-gradient(135deg, ${t.swatch} 55%, ${t.dot} 55%)` }}
                />
                <span className="min-w-0">
                  <span className="type-meta block text-ink">{t.label}</span>
                  <span className="block text-[0.7rem] text-ink-3">{t.note}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Change theme"
        className="flex items-center gap-2 rounded-full border border-rule bg-ground px-3.5 py-2 shadow-frame"
      >
        <span
          className="size-4 rounded-full border border-rule-strong"
          style={{
            background: `linear-gradient(135deg, ${current.swatch} 55%, ${current.dot} 55%)`,
          }}
        />
        <span className="type-meta text-ink">{current.label}</span>
      </button>
    </div>
  )
}
