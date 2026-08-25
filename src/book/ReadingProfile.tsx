import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BookShelfRow } from '@/book/BookShelfRow'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import {
  getBookProfileRatings,
  getReadingProfile,
  type RatedBook,
  type ReadingProfile as Profile,
} from '@/lib/books'
import { errorMessage } from '@/lib/errors'
import { follow, isFollowing, unfollow } from '@/lib/profiles'

/**
 * Anyone's reading profile, including your own.
 *
 * Shows ratings and totals, never dates and never notes — those come from the
 * public views, which exist so a profile can say how much somebody reads
 * without saying when.
 *
 * Following here is a separate act from following the same person for films.
 * Someone whose taste in cinema you trust is not necessarily someone whose
 * reading you want to hear about, and the two halves were built to be kept
 * apart.
 */
export function ReadingProfile({
  userId,
  onBack,
  onOpenBook,
}: {
  userId: string
  onBack?: () => void
  onOpenBook: (olKey: string) => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isMe = user?.id === userId

  const [profile, setProfile] = useState<Profile | null>(null)
  const [books, setBooks] = useState<RatedBook[]>([])
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r, f] = await Promise.all([
        getReadingProfile(userId),
        getBookProfileRatings(userId),
        isMe ? Promise.resolve(false) : isFollowing(userId, 'book'),
      ])
      setProfile(p)
      setBooks(r)
      setFollowing(f)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [userId, isMe])

  useEffect(() => {
    void load()
  }, [load])

  /** One shelf per score given, best first. Grouped here — the page holds them all. */
  const shelves = useMemo(() => {
    const byScore = new Map<number, RatedBook[]>()
    for (const b of books) {
      const shelf = byScore.get(b.rating)
      if (shelf) shelf.push(b)
      else byScore.set(b.rating, [b])
    }
    return [...byScore.entries()].sort((a, b) => b[0] - a[0])
  }, [books])

  async function toggleFollow() {
    setBusy(true)
    // Optimistic: the count is the point of the button, and a bounce-back on
    // failure reads more honestly than a spinner on something this small.
    const next = !following
    setFollowing(next)
    setProfile((p) => (p ? { ...p, followers: p.followers + (next ? 1 : -1) } : p))

    try {
      await (next ? follow(userId, 'book') : unfollow(userId, 'book'))
    } catch (err) {
      setError(errorMessage(err))
      setFollowing(!next)
      setProfile((p) => (p ? { ...p, followers: p.followers + (next ? -1 : 1) } : p))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center wall-ground texture-wall">
        <p className="type-script text-2xl text-ink-3">{t('lists.loading')}</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-dvh wall-ground texture-wall pb-28">
        <ScreenHeader title={t('people.title')} onBack={onBack} />
        <p className="px-6 py-10 text-center text-[0.875rem] text-ink-3">{t('people.notFound')}</p>
      </div>
    )
  }

  const average = books.length
    ? (books.reduce((sum, b) => sum + b.rating, 0) / books.length).toFixed(1)
    : null

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={profile.username} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-accent">{error}</p>}

        <div className="mb-6 flex flex-col items-center">
          <div className="size-24 overflow-hidden rounded-full border border-rule-strong bg-ground-2">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="type-script flex h-full items-center justify-center text-3xl text-ink-3">
                {profile.username[0]?.toUpperCase()}
              </span>
            )}
          </div>

          {profile.bio && (
            <p className="mt-4 max-w-[38ch] text-center text-[0.9375rem] leading-relaxed text-ink-2">
              {profile.bio}
            </p>
          )}
        </div>

        <div className="rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
          <dl className="flex justify-around text-center">
            <Stat label={t('book.stats.read')} value={profile.booksRead} />
            <Stat label={t('me.average')} value={average ?? '—'} />
            <Stat label={t('people.followers')} value={profile.followers} />
            <Stat label={t('people.following')} value={profile.following} />
          </dl>
        </div>

        {!isMe && (
          <button
            type="button"
            onClick={() => void toggleFollow()}
            disabled={busy}
            className={`type-marquee mt-4 w-full rounded-[2px] py-3.5 text-[13px] transition-colors disabled:opacity-60 ${
              following
                ? 'border border-rule-strong text-ink-2 hover:border-accent hover:text-accent'
                : 'bg-accent text-plate'
            }`}
          >
            {following ? t('people.unfollow') : t('book.profile.follow')}
          </button>
        )}

        <div className="rule-pip my-8">
          <span className="type-meta whitespace-nowrap text-ink-3">
            {t('book.profile.ratings')}
          </span>
        </div>

        {shelves.length === 0 ? (
          <p className="text-center text-[0.875rem] leading-relaxed text-ink-3">
            {isMe ? t('book.empty') : t('people.noRatings')}
          </p>
        ) : (
          shelves.map(([score, group]) => (
            <BookShelfRow key={score} score={score} books={group} onOpenBook={onOpenBook} />
          ))
        )}
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="type-meta text-ink-3">{label}</dt>
      <dd className="type-title mt-1 text-[1.375rem] text-ink">{value}</dd>
    </div>
  )
}
