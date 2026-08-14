import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getTheme, setTheme, THEMES, type ThemeId } from '@/lib/theme'

/**
 * Lets the viewer pick which room they are sitting in.
 *
 * Lives in a floating control for now. Once there is a profile screen this
 * should move into it — but the choice stays the user's either way.
 */
export function ThemeSwitcher() {
  const { t } = useTranslation()
  const [theme, setThemeState] = useState<ThemeId>(getTheme)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setTheme(theme)
  }, [theme])

  // Close on Escape or on a click outside, returning focus to the trigger.
  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const current = THEMES.find((x) => x.id === theme) ?? THEMES[0]

  return (
    <div
      ref={rootRef}
      className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {open && (
        <ul
          role="menu"
          aria-label={t('theme.label')}
          className="overflow-hidden rounded-xl border border-rule bg-ground shadow-frame"
        >
          {THEMES.map((option) => (
            <li key={option.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={option.id === theme}
                onClick={() => {
                  setThemeState(option.id)
                  setOpen(false)
                  buttonRef.current?.focus()
                }}
                className={`flex w-56 items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                  option.id === theme ? 'bg-ground-2' : 'hover:bg-ground-2'
                }`}
              >
                <Swatch option={option} />
                <span className="min-w-0 flex-1">
                  <span className="type-meta block text-ink">
                    {t(`theme.${option.id}.name`)}
                  </span>
                  <span className="block text-[0.7rem] text-ink-3">
                    {t(`theme.${option.id}.note`)}
                  </span>
                </span>
                {option.id === theme && (
                  <span className="text-accent" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('theme.label')}
        className="flex items-center gap-2 rounded-full border border-rule bg-ground px-3.5 py-2 shadow-frame"
      >
        <Swatch option={current} small />
        <span className="type-meta text-ink">{t(`theme.${current.id}.name`)}</span>
      </button>
    </div>
  )
}

function Swatch({
  option,
  small = false,
}: {
  option: (typeof THEMES)[number]
  small?: boolean
}) {
  return (
    <span
      aria-hidden
      className={`${small ? 'size-4' : 'size-7'} shrink-0 rounded-full border border-rule-strong`}
      style={{ background: `linear-gradient(135deg, ${option.swatch} 55%, ${option.dot} 55%)` }}
    />
  )
}
