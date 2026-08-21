import { useTranslation } from 'react-i18next'

export type BookView = 'shelf' | 'lists' | 'log' | 'groups' | 'me'

const TABS: Array<{ id: BookView; key: string }> = [
  { id: 'shelf', key: 'book.nav.shelf' },
  { id: 'lists', key: 'book.nav.lists' },
  { id: 'log', key: 'book.nav.log' },
  { id: 'groups', key: 'book.nav.groups' },
  { id: 'me', key: 'book.nav.me' },
]

/**
 * The book half's tab bar.
 *
 * Its own component rather than the film one with different labels: the two
 * halves have different tabs, and a shared bar would have to know about both,
 * which is the sort of thing that ends with a films-only screen reachable from
 * the books side.
 */
export function BookNav({
  current,
  onNavigate,
}: {
  current: BookView
  onNavigate: (view: BookView) => void
}) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('book.nav.label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-band"
    >
      {/* The brass rail along the front of a shelf. */}
      <div className="h-[3px] brass-rail" aria-hidden />

      <ul className="mx-auto flex max-w-lg items-stretch">
        {TABS.map((tab) => {
          const active = tab.id === current
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => onNavigate(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`type-marquee relative w-full py-3.5 text-[12px] transition-colors ${
                  active ? 'text-band-ink' : 'text-band-ink/55 hover:text-band-ink/85'
                }`}
              >
                {active && (
                  <span className="absolute inset-x-0 top-1 mx-auto block size-1 rounded-full bg-accent" />
                )}
                {t(tab.key)}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)] bg-band" aria-hidden />
    </nav>
  )
}
