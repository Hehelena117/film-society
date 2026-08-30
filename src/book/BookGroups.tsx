import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Cover } from '@/book/Cover'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  getBookGroupActivity,
  getGroupCurrentlyReading,
  type BookActivityItem,
  type CurrentRead,
} from '@/lib/bookActivity'
import {
  getGroupDecisions,
  getOpenBookSessions,
  joinBookSwipe,
  startBookSwipe,
  type BookSession,
  type GroupDecision,
} from '@/lib/bookSwipe'
import { getGroupReadingLists, type SharedList } from '@/lib/books'
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
export function BookGroups({
  onJoinSwipe,
  onOpenBook,
}: {
  onJoinSwipe: (sessionId: string) => void
  onOpenBook: (olKey: string) => void
}) {
  const { t, i18n } = useTranslation()

  const [groups, setGroups] = useState<Group[]>([])
  const [sessions, setSessions] = useState<BookSession[]>([])
  const [open, setOpen] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [reading, setReading] = useState<CurrentRead[]>([])
  const [feed, setFeed] = useState<BookActivityItem[]>([])
  const [shared, setShared] = useState<SharedList[]>([])
  const [decisions, setDecisions] = useState<GroupDecision[]>([])
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
      // Open, and actually a group's: ranking a list of your own is a private
      // thing, and it has no business inviting the group to join in.
      setSessions(s.filter((x) => x.decidedBookId === null && x.groupId !== null))
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

    void Promise.all([
      getGroupMembers(open.id),
      getGroupCurrentlyReading(open.id),
      getBookGroupActivity(open.id),
      getGroupReadingLists(open.id),
      getGroupDecisions(open.id),
    ])
      .then(([m, r, f, l, d]) => {
        if (!active) return
        setMembers(m)
        setReading(r)
        setFeed(f)
        setShared(l)
        setDecisions(d)
      })
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

          {/* What people said they are reading. Built from what they chose to
              post, never from their progress, which stays owner-only. */}
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {t('book.groups.reading')}
              </span>
            </div>

            {reading.length === 0 ? (
              <p className="mx-auto max-w-[34ch] text-center text-[0.8125rem] leading-relaxed text-ink-3">
                {t('book.groups.nobodyReading')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {reading.map((r) => (
                  <li key={r.userId} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenBook(r.book.olKey)}
                      aria-label={r.book.title}
                      className="w-11 shrink-0"
                    >
                      <Cover url={r.book.coverUrl} title={r.book.title} />
                    </button>
                    <div className="min-w-0">
                      <p className="type-meta text-accent">{r.username}</p>
                      <p className="type-title truncate text-[0.9375rem] leading-tight text-ink">
                        {r.book.title}
                      </p>
                      <p className="type-meta mt-0.5 truncate text-ink-3">
                        {r.book.authors[0] ?? ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* The lists this group shares — where its next read comes from, so
              it belongs here and not only under your own lists. */}
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {t('book.groups.sharedLists')}
              </span>
            </div>

            {shared.length === 0 ? (
              <p className="mx-auto max-w-[34ch] text-center text-[0.8125rem] leading-relaxed text-ink-3">
                {t('book.groups.noSharedLists')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {shared.map((list) => {
                  // Somebody may already have opened a ranking on this list, and
                  // a second one would split the group across two answers.
                  const live = sessions.find((x) => x.listId === list.id)
                  return (
                    <li
                      key={list.id}
                      className="rounded-[2px] border border-rule bg-ground-2 px-4 py-3.5"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="type-title min-w-0 truncate text-[1.0625rem] text-ink">
                          {list.name}
                        </span>
                        <span className="type-meta shrink-0 text-ink-3">
                          {t('lists.count', { count: list.count })}
                        </span>
                      </div>

                      {list.covers.length > 0 && (
                        <ul className="mt-3 flex gap-2">
                          {list.covers.map((c) => (
                            <li key={c.bookId} className="w-10 shrink-0">
                              <button
                                type="button"
                                onClick={() => onOpenBook(c.olKey)}
                                aria-label={c.title}
                                className="block w-full"
                              >
                                <Cover url={c.coverUrl} title={c.title} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {list.count > 1 && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              if (live) {
                                await joinBookSwipe(live.id)
                                onJoinSwipe(live.id)
                              } else {
                                onJoinSwipe(await startBookSwipe(list.id))
                              }
                            } catch (err) {
                              setError(errorMessage(err))
                            }
                          }}
                          className="type-marquee mt-3 w-full rounded-[2px] border border-rule-strong py-2.5 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
                        >
                          {t(live ? 'book.groups.joinRanking' : 'book.swipe.start')}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* What the group has already settled on. */}
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {t('book.groups.decided')}
              </span>
            </div>

            {decisions.length === 0 ? (
              <p className="mx-auto max-w-[34ch] text-center text-[0.8125rem] leading-relaxed text-ink-3">
                {t('book.groups.noDecisions')}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {decisions.map((d) => {
                  const runnersUp = d.order.filter((o) => o.book.bookId !== d.winner.bookId)
                  return (
                    <li key={d.sessionId} className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenBook(d.winner.olKey)}
                        aria-label={d.winner.title}
                        className="w-12 shrink-0"
                      >
                        <Cover url={d.winner.coverUrl} title={d.winner.title} />
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="type-meta truncate text-ink-3">
                          {[
                            d.listName,
                            d.decidedAt
                              ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
                                  day: 'numeric',
                                  month: 'long',
                                }).format(new Date(d.decidedAt))
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <p className="type-title truncate text-[0.9375rem] leading-tight text-ink">
                          {d.winner.title}
                        </p>
                        <p className="type-meta mt-0.5 truncate text-accent">
                          {d.winner.authors[0] ?? ''}
                        </p>

                        {/* Only the people who ranked may read the order behind
                            the winner, so for anyone else this is simply absent. */}
                        {runnersUp.length > 0 && (
                          <ol className="mt-1.5">
                            {runnersUp.slice(0, 2).map((o, i) => (
                              <li
                                key={o.book.bookId}
                                className="truncate text-[0.75rem] leading-relaxed text-ink-3"
                              >
                                {i + 2}. {o.book.title}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* The group's own feed. */}
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">{t('feed.title')}</span>
            </div>

            {feed.length === 0 ? (
              <p className="text-center text-[0.8125rem] text-ink-3">{t('feed.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {feed.map((item) => (
                  <li key={item.id} className="flex items-baseline gap-2 text-[0.875rem] leading-relaxed">
                    <span className="type-meta shrink-0 text-accent">{item.username}</span>
                    <span className="text-ink-2">
                      {item.kind === 'rated' && item.book
                        ? t('book.feed.rated', { title: item.book.title, rating: item.rating })
                        : item.kind === 'started' && item.book
                          ? t('book.feed.started', { title: item.book.title })
                          : item.kind === 'added' && item.book
                            ? t('book.feed.added', {
                                title: item.book.title,
                                list: item.listName ?? '',
                              })
                            : item.kind === 'decided' && item.book
                              ? t('book.feed.decided', { title: item.book.title })
                              : t('feed.joined')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
