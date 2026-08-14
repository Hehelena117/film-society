import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import {
  follow,
  getProfile,
  getProfileRatings,
  isFollowing,
  unfollow,
  type PublicProfile,
  type RatedTitle,
} from '@/lib/profiles'
import type { FollowListTarget } from '@/screens/FollowList'
import type { TitleRef } from '@/screens/TitleDetail'

/**
 * Anyone's profile, including your own.
 *
 * Shows ratings and totals, never dates — those come from the public views,
 * which exist so a profile can say how much someone watches without saying
 * when. See docs/DECISIONS.md.
 */
export function Profile({
  userId,
  onBack,
  onOpenTitle,
  onOpenFollows,
}: {
  userId: string
  onBack?: () => void
  onOpenTitle: (ref: TitleRef) => void
  onOpenFollows: (target: FollowListTarget) => void
}) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isMe = user?.id === userId

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [ratings, setRatings] = useState<RatedTitle[]>([])
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r, f] = await Promise.all([
        getProfile(userId),
        getProfileRatings(userId, i18n.resolvedLanguage ?? 'en'),
        isMe ? Promise.resolve(false) : isFollowing(userId),
      ])
      setProfile(p)
      setRatings(r)
      setFollowing(f)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [userId, i18n.resolvedLanguage, isMe])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleFollow() {
    setBusy(true)
    // Optimistic: the count is the point of the button, and a bounce-back on
    // failure reads more honestly than a spinner on something this small.
    const next = !following
    setFollowing(next)
    setProfile((p) => (p ? { ...p, followers: p.followers + (next ? 1 : -1) } : p))

    try {
      await (next ? follow(userId) : unfollow(userId))
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

  const average = ratings.length
    ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
    : null

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={profile.username} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {profile.bio && (
          <p className="mb-6 text-center text-[0.9375rem] leading-relaxed text-ink-2">
            {profile.bio}
          </p>
        )}

        <div className="rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
          <dl className="flex justify-around text-center">
            <Stat label={t('me.watched')} value={profile.titlesWatched} />
            <Stat label={t('me.average')} value={average ?? '—'} />
            <Stat
              label={t('people.followers')}
              value={profile.followers}
              onClick={
                profile.followers > 0
                  ? () =>
                      onOpenFollows({
                        userId,
                        username: profile.username,
                        direction: 'followers',
                      })
                  : undefined
              }
            />
            <Stat
              label={t('people.following')}
              value={profile.following}
              onClick={
                profile.following > 0
                  ? () =>
                      onOpenFollows({
                        userId,
                        username: profile.username,
                        direction: 'following',
                      })
                  : undefined
              }
            />
          </dl>
        </div>

        {!isMe && (
          <button
            type="button"
            onClick={() => void toggleFollow()}
            disabled={busy}
            className={`type-marquee mt-4 w-full rounded-[2px] py-3.5 text-[13px] transition-colors disabled:opacity-60 ${
              following
                ? 'border border-rule-strong text-ink-2 hover:border-velvet-500 hover:text-velvet-500'
                : 'bg-velvet-600 text-plate hover:bg-velvet-700'
            }`}
          >
            {following ? t('people.unfollow') : t('people.follow')}
          </button>
        )}

        <div className="rule-pip my-8">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('people.ratings')}</span>
        </div>

        {ratings.length === 0 ? (
          <p className="text-center text-[0.875rem] leading-relaxed text-ink-3">
            {isMe ? t('me.empty') : t('people.noRatings')}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {ratings.map((r) => (
              <li key={r.titleId}>
                <button
                  type="button"
                  onClick={() => onOpenTitle({ tmdbId: r.tmdbId, mediaType: r.mediaType })}
                  className="block w-full"
                >
                  <div className="relative overflow-hidden rounded-[2px] bg-frame p-1 shadow-lift">
                    <div className="aspect-2/3 overflow-hidden bg-pitch">
                      {r.posterUrl && (
                        <img
                          src={r.posterUrl}
                          alt={r.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <span className="type-marquee absolute right-1.5 bottom-1.5 rounded-[2px] bg-velvet-600 px-1.5 py-0.5 text-[11px] text-plate">
                      {r.rating}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-left text-[0.7rem] leading-tight text-ink">
                    {r.name}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

/** A count with nothing behind it is not worth pressing, so it stays inert. */
function Stat({
  label,
  value,
  onClick,
}: {
  label: string
  value: string | number
  onClick?: () => void
}) {
  const body = (
    <>
      <dt className="type-meta text-ink-3">{label}</dt>
      <dd
        className={`type-title mt-1 text-[1.375rem] ${
          onClick ? 'text-accent underline underline-offset-4' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </>
  )

  return onClick ? (
    <button type="button" onClick={onClick} className="text-center">
      {body}
    </button>
  ) : (
    <div>{body}</div>
  )
}
