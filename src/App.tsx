import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { BottomNav, type View } from '@/components/BottomNav'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AuthProvider, useAuth } from '@/lib/auth'
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
  const [findingPeople, setFindingPeople] = useState(false)
  const [editing, setEditing] = useState(false)
  const [prefill, setPrefill] = useState<TitleRef | null>(null)
  // Remounts the Lobby after a save, so a newly logged film feeds the
  // recommender straight away rather than on next reload.
  const [lobbyKey, setLobbyKey] = useState(0)

  if (loading) return <Curtain />
  if (!session) {
    return (
      <Screen>
        <BoxOffice />
      </Screen>
    )
  }

  // A swipe session takes over the screen: navigating away mid-decision would
  // leave the others waiting on a vote that never arrives.
  if (swipeSession) {
    return (
      <Screen>
        <Swipe sessionId={swipeSession} onExit={() => setSwipeSession(null)} />
      </Screen>
    )
  }

  if (editing) {
    return (
      <Screen>
        <EditProfile onBack={() => setEditing(false)} />
      </Screen>
    )
  }

  // Deeper than a profile, so it is checked first.
  if (openFollows) {
    return (
      <Screen>
        <FollowList
          target={openFollows}
          onBack={() => setOpenFollows(null)}
          onOpenProfile={(id) => {
            setOpenFollows(null)
            setOpenProfile(id)
          }}
        />
      </Screen>
    )
  }

  if (openProfile) {
    return (
      <Screen>
        <Profile
          userId={openProfile}
          onBack={() => setOpenProfile(null)}
          onOpenTitle={setOpenTitle}
          onOpenFollows={setOpenFollows}
        />
      </Screen>
    )
  }

  if (findingPeople) {
    return (
      <Screen>
        <People
          onBack={() => setFindingPeople(false)}
          onOpenProfile={(id) => {
            setFindingPeople(false)
            setOpenProfile(id)
          }}
        />
      </Screen>
    )
  }

  // Title pages layer over whatever you were doing, and hand you back to it.
  if (openTitle) {
    return (
      <Screen>
        <TitleDetail
          title={openTitle}
          onBack={() => setOpenTitle(null)}
          onLog={(t) => {
            setPrefill({ tmdbId: t.tmdbId, mediaType: t.mediaType })
            setOpenTitle(null)
            setView('log')
          }}
        />
      </Screen>
    )
  }

  return (
    <>
      <Screen>
        {view === 'lobby' && <Lobby key={lobbyKey} onOpenTitle={setOpenTitle} />}
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
            onDone={() => {
              setPrefill(null)
              setView('lobby')
              setLobbyKey((k) => k + 1)
            }}
          />
        )}
      </Screen>

      <BottomNav
        current={view}
        onNavigate={(next) => {
          if (next !== 'log') setPrefill(null)
          setView(next)
        }}
      />
      <ThemeSwitcher />
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
