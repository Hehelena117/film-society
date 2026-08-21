import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { getOpenBookSessions, joinBookSwipe, type BookSession } from '@/lib/bookSwipe'
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

/**
 * Book groups — the people you read with.
 *
 * The same table as film groups, with a `side` marker, so a bug fixed in one
 * is fixed in both. What is not shared is membership on screen: a group made
 * here never appears on the film side, which is what "two sealed worlds"
 * means in practice.
 */
export function BookGroups({ onJoinSwipe }: { onJoinSwipe: (sessionId: string) => void }) {
  const { t } = useTranslation()

  const [groups, setGroups] = useState<Group[]>([])
  const [sessions, setSessions] = useState<BookSession[]>([])
  const [open, setOpen] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [g, s] = await Promise.all([getMyGroups('book'), getOpenBookSessions()])
      setGroups(g)
      setSessions(s.filter((x) => x.decidedBookId === null))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    let active = true
    getGroupMembers(open.id)
      .then((m) => active && setMembers(m))
      .catch((err) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [open])

  if (open) {
    return (
      <div className="min-h-dvh wall-ground texture-wall pb-28">
        <ScreenHeader title={open.name} onBack={() => setOpen(null)} />

        <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
          {error && <p className="mb-5 text-[0.875rem] text-accent">{error}</p>}

          <div className="rule-pip mb-4">
            <span className="type-meta whitespace-nowrap text-ink-3">
              {t('groups.members', { count: members.length })}
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center gap-3 rounded-[2px] border border-rule bg-ground-2 px-4 py-3"
              >
                <span className="size-9 shrink-0 overflow-hidden rounded-full border border-rule bg-ground">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="type-script flex h-full items-center justify-center text-ink-3">
                      {m.username[0]?.toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-title block text-[1rem] text-ink">{m.username}</span>
                  {m.role === 'admin' && (
                    <span className="type-meta text-ink-3">{t('groups.admin')}</span>
                  )}
                </span>
                {open.role === 'admin' && m.role !== 'admin' && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await removeMember(open.id, m.userId)
                        setMembers((c) => c.filter((x) => x.userId !== m.userId))
                      } catch (err) {
                        setError(errorMessage(err))
                      }
                    }}
                    className="type-meta shrink-0 text-ink-3 underline underline-offset-4 hover:text-accent"
                  >
                    {t('groups.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {open.role === 'admin' && (
            <div className="mt-6">
              <label className="block">
                <span className="type-meta mb-2 block text-ink-3">{t('groups.addByUsername')}</span>
                <div className="flex gap-2">
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('groups.usernamePlaceholder')}
                    className="min-w-0 flex-1 rounded-[2px] border border-rule bg-ground-2 px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!username.trim()) return
                      try {
                        await addMemberByUsername(open.id, username)
                        setUsername('')
                        setMembers(await getGroupMembers(open.id))
                      } catch (err) {
                        setError(errorMessage(err))
                      }
                    }}
                    className="type-marquee shrink-0 rounded-[2px] bg-accent px-5 text-[13px] text-plate"
                  >
                    {t('groups.add')}
                  </button>
                </div>
              </label>
            </div>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('book.groups.title')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-accent">{error}</p>}

        {/* Anything being decided right now, so the others can join it. */}
        {sessions.length > 0 && (
          <section className="mb-8">
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
                    onClick={async () => {
                      try {
                        await joinBookSwipe(s.id)
                        onJoinSwipe(s.id)
                      } catch (err) {
                        setError(errorMessage(err))
                      }
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-[2px] border border-accent/40 bg-accent/5 px-4 py-3.5 text-left"
                  >
                    <span>
                      <span className="type-title block text-[1rem] text-ink">{s.listName}</span>
                      <span className="type-meta mt-1 block text-ink-3">
                        {t('swipe.watching', { count: s.participants })}
                      </span>
                    </span>
                    <span className="type-marquee shrink-0 text-[12px] text-accent">
                      {t('swipe.join')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {creating ? (
          <div className="rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('groups.name')}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-[2px] border border-rule bg-ground px-3.5 py-3 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!name.trim()) return
                  try {
                    await createGroup(name, 'book')
                    setName('')
                    setCreating(false)
                    await load()
                  } catch (err) {
                    setError(errorMessage(err))
                  }
                }}
                className="type-marquee flex-1 rounded-[2px] bg-accent py-3 text-[13px] text-plate"
              >
                {t('groups.create')}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="type-marquee flex-1 rounded-[2px] border border-rule-strong py-3 text-[13px] text-ink-2"
              >
                {t('log.close')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="type-marquee w-full rounded-[2px] border border-dashed border-rule-strong py-4 text-[13px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            + {t('book.groups.new')}
          </button>
        )}

        {loading ? (
          <p className="type-meta mt-8 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : groups.length === 0 ? (
          <p className="mt-8 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('book.groups.empty')}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setOpen(g)}
                  className="flex w-full items-center justify-between gap-3 rounded-[2px] border border-rule bg-ground-2 px-4 py-3.5 text-left transition-colors hover:border-brass-600"
                >
                  <span>
                    <span className="type-title block text-[1.0625rem] text-ink">{g.name}</span>
                    <span className="type-meta mt-1 block text-ink-3">
                      {t('groups.members', { count: g.memberCount })}
                    </span>
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
