import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { BottomNav, type View } from '@/components/BottomNav'
import { KeepAlive } from '@/components/KeepAlive'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AuthProvider, useAuth } from '@/lib/auth'
import type { CollectionTarget } from '@/screens/Collection'
import type { FollowListTarget } from '@/screens/FollowList'
import type { TitleRef } from '@/screens/TitleDetail'

/**
 * Every screen is loaded on demand.
 *
 * Nobody needs the swipe deck, the groups screens or the log form in the first
 * second, and shipping them up front made the initial download twice what it
 * needed to be. These `import type` lines above are erased at compile time, so
 * they cost nothing and do not drag the module back into the main chunk.
 */
const BoxOffice = lazy(() => import('@/screens/BoxOffice').then((m) => ({ default: m.BoxOffice })))
const Lobby = lazy(() => import('@/screens/Lobby').then((m) => ({ default: m.Lobby })))
const Watchlists = lazy(() =>
  import('@/screens/Watchlists').then((m) => ({ default: m.Watchlists })),
)
const Groups = lazy(() => import('@/screens/Groups').then((m) => ({ default: m.Groups })))
const Me = lazy(() => import('@/screens/Me').then((m) => ({ default: m.Me })))
const LogViewing = lazy(() =>
  import('@/screens/LogViewing').then((m) => ({ default: m.LogViewing })),
)
const Swipe = lazy(() => import('@/screens/Swipe').then((m) => ({ default: m.Swipe })))
const TitleDetail = lazy(() =>
  import('@/screens/TitleDetail').then((m) => ({ default: m.TitleDetail })),
)
const People = lazy(() => import('@/screens/People').then((m) => ({ default: m.People })))
const Profile = lazy(() => import('@/screens/Profile').then((m) => ({ default: m.Profile })))
const FollowList = lazy(() =>
  import('@/screens/FollowList').then((m) => ({ default: m.FollowList })),
)
const EditProfile = lazy(() =>
  import('@/screens/EditProfile').then((m) => ({ default: m.EditProfile })),
)
const Collection = lazy(() =>
  import('@/screens/Collection').then((m) => ({ default: m.Collection })),
)

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  const [view, setView] = useState<View>('lobby')
  const [swipeSession, setSwipeSession] = useState<string | null>(null)
  const [openTitle, setOpenTitle] = useState<TitleRef | null>(null)
  const [openProfile, setOpenProfile] = useState<string | null>(null)
  const [openFollows, setOpenFollows] = useState<FollowListTarget | null>(null)
  const [openCollection, setOpenCollection] = useState<CollectionTarget | null>(null)
  const [findingPeople, setFindingPeople] = useState(false)
  const [editing, setEditing] = useState(false)
  const [prefill, setPrefill] = useState<TitleRef | null>(null)

  if (loading) return <Curtain />
  if (!session) {
    return (
      <Screen>
        <BoxOffice />
      </Screen>
    )
  }

  /**
   * Screens that cover everything else.
   *
   * These used to be early returns, which unmounted the whole tree — including
   * the Lobby underneath — so opening a title page and coming back rebuilt the
   * wall from scratch. Choosing one here instead lets the tab layer stay
   * mounted below.
   *
   * Order is precedence, and it is the order things were opened in: whatever
   * you opened last is what you should be looking at.
   *
   * A title page therefore outranks everything but a swipe session. It used to
   * sit at the bottom, which meant a poster tapped on a profile set openTitle
   * and changed nothing on screen, because the profile below still won — the
   * films on a profile were simply dead to the touch. Found by a browser test
   * tapping one; no amount of reading this chain had caught it.
   */
  const overlay = swipeSession ? (
    // A swipe session takes over the screen: navigating away mid-decision
    // would leave the others waiting on a vote that never arrives.
    <Swipe sessionId={swipeSession} onExit={() => setSwipeSession(null)} />
  ) : openTitle ? (
    <TitleDetail
      title={openTitle}
      onBack={() => setOpenTitle(null)}
      onLog={(t) => {
        setPrefill({ tmdbId: t.tmdbId, mediaType: t.mediaType })
        // Everything the title page was opened over has to go too, or leaving
        // for the log form lands you back on the profile you came through.
        setOpenTitle(null)
        setOpenProfile(null)
        setOpenCollection(null)
        setOpenFollows(null)
        setFindingPeople(false)
        setView('log')
      }}
    />
  ) : editing ? (
    <EditProfile onBack={() => setEditing(false)} />
  ) : openFollows ? (
    <FollowList
      target={openFollows}
      onBack={() => setOpenFollows(null)}
      onOpenProfile={(id) => {
        setOpenFollows(null)
        setOpenProfile(id)
      }}
    />
  ) : openCollection ? (
    <Collection
      target={openCollection}
      onBack={() => setOpenCollection(null)}
      onOpenTitle={setOpenTitle}
    />
  ) : openProfile ? (
    <Profile
      userId={openProfile}
      onBack={() => setOpenProfile(null)}
      onOpenTitle={setOpenTitle}
      onOpenFollows={setOpenFollows}
      onOpenCollection={setOpenCollection}
    />
  ) : findingPeople ? (
    <People
      onBack={() => setFindingPeople(false)}
      onOpenProfile={(id) => {
        setFindingPeople(false)
        setOpenProfile(id)
      }}
    />
  ) : null

  return (
    <>
      {/* The Lobby stays mounted for the whole session and is only hidden, so
          neither switching tabs nor opening a title page throws the wall away.
          It changes when asked to, and not otherwise. Every other screen is
          cheap to rebuild and unmounts normally. */}
      <KeepAlive active={view === 'lobby' && !overlay}>
        <Screen>
          <Lobby onOpenTitle={setOpenTitle} />
        </Screen>
      </KeepAlive>

      {overlay && <Screen>{overlay}</Screen>}

      {!overlay && (
        <Screen>
          {view === 'lists' && (
            <Watchlists onStartSwipe={setSwipeSession} onOpenTitle={setOpenTitle} />
          )}
          {view === 'groups' && <Groups onJoinSwipe={setSwipeSession} />}
          {view === 'me' && (
            <Me
              onOpenTitle={setOpenTitle}
              onFindPeople={() => setFindingPeople(true)}
              onOpenProfile={setOpenProfile}
              onEditProfile={() => setEditing(true)}
            />
          )}
          {view === 'log' && (
            <LogViewing
              prefill={prefill}
              onOpenTitle={setOpenTitle}
              onDone={() => {
                setPrefill(null)
                setView('lobby')
              }}
            />
          )}
        </Screen>
      )}

      {/* An overlay carries its own way back, so the tab bar would only offer
          a second, more confusing one. */}
      {!overlay && (
        <BottomNav
          current={view}
          onNavigate={(next) => {
            if (next !== 'log') setPrefill(null)
            setView(next)
          }}
        />
      )}
      {!overlay && <ThemeSwitcher />}
    </>
  )
}

/** Holds the ground while a screen's chunk arrives. */
function Screen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Curtain />}>{children}</Suspense>
}

/** Also shown while we work out whether there is a stored session. */
function Curtain() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center wall-ground texture-wall">
      <p className="type-script text-2xl text-ink-3">{t('app.name')}</p>
    </div>
  )
}
