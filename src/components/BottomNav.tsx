import { useTranslation } from 'react-i18next'

export type View = 'lobby' | 'log' | 'lists' | 'groups' | 'me'

const ITEMS: Array<{ id: View; key: string; accent?: boolean }> = [
  { id: 'lobby', key: 'nav.lobby' },
  { id: 'lists', key: 'nav.lists' },
  { id: 'log', key: 'nav.log', accent: true },
  { id: 'groups', key: 'nav.groups' },
  { id: 'me', key: 'nav.me' },
]

/**
 * The tile floor, doing a job.
 *
 * The checkerboard started as decoration pinned to the bottom of the Lobby,
 * which read as a navigation bar people could not press. Now it is the top
 * edge of one, which is where it always wanted to be.
 */
export function BottomNav({
  current,
  onNavigate,
}: {
  current: View
  onNavigate: (view: View) => void
}) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 bg-ground"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="h-2 floor-checker opacity-30" aria-hidden />

      <ul className="flex">
        {ITEMS.map((item) => {
          const active = current === item.id
          return (
            <li key={item.id} className="flex-1">
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`type-marquee flex w-full flex-col items-center gap-1 py-3 text-[11px] transition-colors ${
                  item.accent
                    ? 'text-velvet-600'
                    : active
                      ? 'text-ink'
                      : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1 w-1 rounded-full transition-colors ${
                    active ? 'bg-accent' : 'bg-transparent'
                  }`}
                />
                {t(item.key)}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
