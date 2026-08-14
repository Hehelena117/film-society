import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BottomNav, type View } from '@/components/BottomNav'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AuthProvider, useAuth } from '@/lib/auth'
import { BoxOffice } from '@/screens/BoxOffice'
import { Groups } from '@/screens/Groups'
import { Lobby } from '@/screens/Lobby'
import { LogViewing } from '@/screens/LogViewing'
import { FollowList, type FollowListTarget } from '@/screens/FollowList'
import { Me } from '@/screens/Me'
import { People } from '@/screens/People'
import { Profile } from '@/screens/Profile'
import { Swipe } from '@/screens/Swipe'
import { TitleDetail, type TitleRef } from '@/screens/TitleDetail'
import { Watchlists } from '@/screens/Watchlists'

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
  const [prefill, setPrefill] = useState<TitleRef | null>(null)
  // Remounts the Lobby after a save, so a newly logged film feeds the
  // recommender straight away rather than on next reload.
  const [lobbyKey, setLobbyKey] = useState(0)

  if (loading) return <Curtain />
  if (!session) return <BoxOffice />

  // A swipe session takes over the screen: navigating away mid-decision would
  // leave the others waiting on a vote that never arrives.
  if (swipeSession) {
    return <Swipe sessionId={swipeSession} onExit={() => setSwipeSession(null)} />
  }

  // Title pages layer over whatever you were doing, and hand you back to it.
  if (openTitle) {
    return (
      <TitleDetail
        title={openTitle}
        onBack={() => setOpenTitle(null)}
        onLog={(t) => {
          setPrefill({ tmdbId: t.tmdbId, mediaType: t.mediaType })
          setOpenTitle(null)
          setView('log')
        }}
      />
    )
  }

  // Profiles and people search sit above the tabs too, so following someone
  // from a group returns you to the group rather than dumping you on a tab.
  // Deeper than a profile, so it is checked first.
  if (openFollows) {
    return (
      <FollowList
        target={openFollows}
        onBack={() => setOpenFollows(null)}
        onOpenProfile={(id) => {
          setOpenFollows(null)
          setOpenProfile(id)
        }}
      />
    )
  }

  if (openProfile) {
    return (
      <Profile
        userId={openProfile}
        onBack={() => setOpenProfile(null)}
        onOpenTitle={setOpenTitle}
        onOpenFollows={setOpenFollows}
      />
    )
  }

  if (findingPeople) {
    return (
      <People
        onBack={() => setFindingPeople(false)}
        onOpenProfile={(id) => {
          setFindingPeople(false)
          setOpenProfile(id)
        }}
      />
    )
  }

  return (
    <>
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

/** Shown while we work out whether there is a stored session. */
function Curtain() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center wall-ground texture-wall">
      <p className="type-script text-2xl text-ink-3">{t('app.name')}</p>
    </div>
  )
}
