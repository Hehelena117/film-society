import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import {
  addMemberByUsername,
  createGroup,
  getGroupMembers,
  getMyGroups,
  removeMember,
  type Group,
  type GroupMember,
} from '@/lib/groups'
import { getGroupActivity, type ActivityItem } from '@/lib/activity'
import { getOpenSessions, type OpenSession } from '@/lib/swipe'

export function Groups({ onJoinSwipe }: { onJoinSwipe: (sessionId: string) => void }) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Group[]>([])
  const [open, setOpen] = useState<Group | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setGroups(await getMyGroups())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createGroup(name.trim())
      setName('')
      setCreating(false)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (open) {
    return (
      <GroupDetail
        group={open}
        onJoinSwipe={onJoinSwipe}
        onBack={() => {
          setOpen(null)
          void refresh()
        }}
      />
    )
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('groups.title')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {creating ? (
          <div className="rounded-[2px] border border-rule bg-ground-2 p-4">
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('groups.name')}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
              />
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy || !name.trim()}
                className="type-marquee flex-1 rounded-[2px] bg-velvet-600 py-3 text-[13px] text-plate hover:bg-velvet-700 disabled:opacity-60"
              >
                {t('groups.create')}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="type-marquee rounded-[2px] border border-rule px-5 py-3 text-[13px] text-ink-3"
              >
                {t('log.close')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="type-marquee w-full rounded-[2px] border border-dashed border-rule-strong py-3.5 text-[13px] text-ink-3 transition-colors hover:border-brass-600 hover:text-ink-2"
          >
            + {t('groups.new')}
          </button>
        )}

        {loading ? (
          <p className="type-meta mt-8 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : groups.length === 0 && !creating ? (
          <p className="mt-10 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('groups.empty')}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2.5">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setOpen(g)}
                  className="w-full rounded-[2px] border border-rule bg-ground-2 px-4 py-3.5 text-left transition-colors hover:border-brass-600"
                >
                  <span className="type-title block text-[1.125rem] text-ink">{g.name}</span>
                  <span className="type-meta mt-1.5 block text-ink-3">
                    {t('groups.members', { count: g.memberCount })}
                    {g.role === 'admin' && <> · {t('groups.admin')}</>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function GroupDetail({
  group,
  onBack,
  onJoinSwipe,
}: {
  group: Group
  onBack: () => void
  onJoinSwipe: (sessionId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const language = i18n.resolvedLanguage ?? 'en'
  const [members, setMembers] = useState<GroupMember[]>([])
  const [sessions, setSessions] = useState<OpenSession[]>([])
  const [feed, setFeed] = useState<ActivityItem[]>([])
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, s, a] = await Promise.all([
        getGroupMembers(group.id),
        getOpenSessions(group.id),
        getGroupActivity(group.id, language),
      ])
      setMembers(m)
      setSessions(s)
      setFeed(a)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [group.id, language])

  useEffect(() => {
    void load()
  }, [load])

  async function invite() {
    if (!username.trim()) return
    setBusy(true)
    setError(null)
    try {
      await addMemberByUsername(group.id, username)
      setUsername('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function kick(userId: string) {
    try {
      await removeMember(group.id, userId)
      if (userId === user?.id) {
        onBack()
        return
      }
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={group.name} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {group.role === 'admin' && (
          <div className="rounded-[2px] border border-rule bg-ground-2 p-4">
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('groups.addByUsername')}</span>
              <div className="flex gap-2">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('groups.usernamePlaceholder')}
                  className="min-w-0 flex-1 rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
                />
                <button
                  type="button"
                  onClick={() => void invite()}
                  disabled={busy || !username.trim()}
                  className="type-marquee rounded-[2px] bg-velvet-600 px-5 text-[13px] text-plate hover:bg-velvet-700 disabled:opacity-60"
                >
                  {t('groups.add')}
                </button>
              </div>
            </label>
          </div>
        )}

        {sessions.length > 0 && (
          <section className="mt-6">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {t('swipe.openSessions')}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onJoinSwipe(s.id)}
                    className="flex w-full items-center justify-between rounded-[2px] border border-brass-600/60 bg-ground-2 px-4 py-3 text-left transition-colors hover:border-brass-600"
                  >
                    <span>
                      <span className="type-title block text-[1rem] text-ink">
                        {s.watchlistName ?? t('swipe.title')}
                      </span>
                      <span className="type-meta mt-1 block text-ink-3">
                        {t('swipe.watching', { count: s.participants })}
                      </span>
                    </span>
                    <span className="type-marquee text-[12px] text-accent">{t('swipe.join')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ul className="mt-6 flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-[2px] border border-rule bg-ground-2 px-4 py-3"
            >
              <span>
                <span className="type-title block text-[1rem] text-ink">{m.username}</span>
                {m.role === 'admin' && (
                  <span className="type-meta mt-1 block text-ink-3">{t('groups.admin')}</span>
                )}
              </span>

              {(group.role === 'admin' || m.userId === user?.id) && (
                <button
                  type="button"
                  onClick={() => void kick(m.userId)}
                  className="text-[0.75rem] text-ink-3 underline underline-offset-2 hover:text-velvet-500"
                >
                  {m.userId === user?.id ? t('groups.leave') : t('groups.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* ---- The feed, which exists only here ---------------------------- */}
        <section className="mt-10">
          <div className="rule-pip mb-4">
            <span className="type-meta whitespace-nowrap text-ink-3">{t('feed.title')}</span>
          </div>

          {feed.length === 0 ? (
            <p className="text-center text-[0.875rem] leading-relaxed text-ink-3">
              {t('feed.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {feed.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  {item.title?.posterUrl ? (
                    <img
                      src={item.title.posterUrl}
                      alt=""
                      loading="lazy"
                      className="h-14 w-10 shrink-0 rounded-[2px] object-cover"
                    />
                  ) : (
                    <span className="h-14 w-10 shrink-0 rounded-[2px] bg-ground-2" />
                  )}

                  <p className="text-[0.875rem] leading-snug text-ink-2">
                    <span className="text-ink">{item.actorName}</span>{' '}
                    {item.kind === 'rated' && item.title
                      ? t('feed.rated', { title: item.title.name, rating: item.rating })
                      : item.kind === 'added_to_list' && item.title
                        ? t('feed.added', {
                            title: item.title.name,
                            list: item.watchlistName ?? '—',
                          })
                        : item.kind === 'decided' && item.title
                          ? t('feed.decided', { title: item.title.name })
                          : t('feed.joined')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
