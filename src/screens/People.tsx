import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { errorMessage } from '@/lib/errors'
import {
  findProfiles,
  getNewMembers,
  getSuggestedPeople,
  type PublicProfile,
} from '@/lib/profiles'

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
  const [suggested, setSuggested] = useState<PublicProfile[]>([])
  const [newcomers, setNewcomers] = useState<PublicProfile[]>([])

  // Silent on failure: a shortcut that cannot load should leave the search
  // box working, not put an error over it.
  useEffect(() => {
    let active = true
    void getSuggestedPeople('film').then(async (peers) => {
      if (!active) return
      setSuggested(peers)
      // Fetched after, so the same person is never offered twice on one screen.
      const rest = await getNewMembers('film', peers.map((p) => p.id))
      if (active) setNewcomers(rest)
    })
    return () => {
      active = false
    }
  }, [])

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
            <PersonRow key={p.id} person={p} onOpen={() => onOpenProfile(p.id)} />
          ))}
        </ul>

        {query.trim() && !searching && results.length === 0 && (
          <p className="mt-8 text-center text-[0.875rem] text-ink-3">{t('people.notFound')}</p>
        )}

        {/* Nothing typed. Everyone you share a group with is someone you have
            already chosen to watch films with, so asking you to type their
            username to find them is asking for something the app knows. */}
        {!query.trim() && (
          <>
            <PeopleSection
              title={t('people.inYourGroups')}
              people={suggested}
              onOpenProfile={onOpenProfile}
              empty={t('people.noSuggestions')}
            />

            {/* A new account has no groups, so the row above is empty for
                exactly the person with the least idea who to look for. */}
            <PeopleSection
              title={t('people.newMembers')}
              people={newcomers}
              onOpenProfile={onOpenProfile}
              empty={t('people.noNewMembers')}
            />
          </>
        )}
      </main>
    </div>
  )
}

/** A labelled list of people, or a line saying why there are none. */
function PeopleSection({
  title,
  people,
  onOpenProfile,
  empty,
}: {
  title: string
  people: PublicProfile[]
  onOpenProfile: (userId: string) => void
  empty?: string
}) {
  if (!people.length && !empty) return null

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2">
        <h2 className="type-marquee text-[13px] text-ink">{title}</h2>
        {people.length > 0 && <span className="type-meta ml-auto text-ink-3">{people.length}</span>}
      </div>

      {people.length ? (
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <PersonRow key={p.id} person={p} onOpen={() => onOpenProfile(p.id)} />
          ))}
        </ul>
      ) : (
        <p className="mx-auto max-w-[34ch] text-center text-[0.8125rem] leading-relaxed text-ink-3">
          {empty}
        </p>
      )}
    </section>
  )
}

/** One person, the same whether found by typing or offered up front. */
function PersonRow({ person, onOpen }: { person: PublicProfile; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-[2px] border border-rule bg-ground-2 px-4 py-3 text-left transition-colors hover:border-brass-600"
      >
        <span className="size-10 shrink-0 overflow-hidden rounded-full border border-rule bg-ground">
          {person.avatarUrl ? (
            <img
              src={person.avatarUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="type-script flex h-full items-center justify-center text-ink-3">
              {person.username[0]?.toUpperCase()}
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="type-title block text-[1.0625rem] text-ink">{person.username}</span>
          {person.bio && (
            <span className="mt-0.5 line-clamp-1 block text-[0.8125rem] text-ink-3">
              {person.bio}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
