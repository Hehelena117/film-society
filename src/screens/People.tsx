import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { errorMessage } from '@/lib/errors'
import { findProfiles, type PublicProfile } from '@/lib/profiles'

/** Find someone by username. Profiles are public, so this needs no privilege. */
export function People({
  onOpenProfile,
  onBack,
}: {
  onOpenProfile: (userId: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        setResults(await findProfiles(query))
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [query])

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('people.title')} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        <label className="block">
          <span className="type-meta mb-2 block text-ink-3">{t('people.search')}</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('groups.usernamePlaceholder')}
            className="w-full rounded-[2px] border border-rule bg-ground-2 px-3.5 py-3 text-[0.9375rem] text-ink outline-none focus:border-brass-600 focus:ring-1 focus:ring-brass-600/50"
          />
        </label>

        {error && <p className="mt-4 text-[0.875rem] text-velvet-500">{error}</p>}

        <p className="type-meta mt-3 h-4 text-ink-3/70">{searching ? t('log.searching') : ''}</p>

        <ul className="mt-3 flex flex-col gap-2">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenProfile(p.id)}
                className="flex w-full items-center gap-3 rounded-[2px] border border-rule bg-ground-2 px-4 py-3 text-left transition-colors hover:border-brass-600"
              >
                <span className="size-10 shrink-0 overflow-hidden rounded-full border border-rule bg-ground">
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="type-script flex h-full items-center justify-center text-ink-3">
                      {p.username[0]?.toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="type-title block text-[1.0625rem] text-ink">{p.username}</span>
                  {p.bio && (
                    <span className="mt-0.5 line-clamp-1 block text-[0.8125rem] text-ink-3">
                      {p.bio}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {query.trim() && !searching && results.length === 0 && (
          <p className="mt-8 text-center text-[0.875rem] text-ink-3">{t('people.notFound')}</p>
        )}
      </main>
    </div>
  )
}
