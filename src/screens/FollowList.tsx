import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { errorMessage } from '@/lib/errors'
import { getFollowList, type PublicProfile } from '@/lib/profiles'

export interface FollowListTarget {
  userId: string
  username: string
  direction: 'followers' | 'following'
}

/** The names behind the counts on a profile. */
export function FollowList({
  target,
  onBack,
  onOpenProfile,
}: {
  target: FollowListTarget
  onBack: () => void
  onOpenProfile: (userId: string) => void
}) {
  const { t } = useTranslation()
  const [people, setPeople] = useState<PublicProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)

    getFollowList(target.userId, target.direction)
      .then((p) => active && setPeople(p))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [target.userId, target.direction])

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader
        title={`${target.username} · ${t(`people.${target.direction}`)}`}
        onBack={onBack}
      />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {loading ? (
          <p className="type-meta text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : people.length === 0 ? (
          <p className="mt-6 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t(`people.no${target.direction === 'followers' ? 'Followers' : 'Following'}`)}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenProfile(p.id)}
                  className="w-full rounded-[2px] border border-rule bg-ground-2 px-4 py-3.5 text-left transition-colors hover:border-brass-600"
                >
                  <span className="type-title block text-[1.0625rem] text-ink">{p.username}</span>
                  {p.bio && (
                    <span className="mt-1 line-clamp-1 block text-[0.8125rem] text-ink-3">
                      {p.bio}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
