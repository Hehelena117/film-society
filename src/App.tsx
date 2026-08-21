import { lazy, useEffect, useState } from 'react'

import { Screen, Curtain } from '@/components/Screen'
import { AuthProvider, useAuth } from '@/lib/auth'
import { updateMyProfile } from '@/lib/profiles'
import { isSide, rememberedSide, rememberSide, type Side } from '@/lib/side'
import { applyTheme } from '@/lib/theme'

const BoxOffice = lazy(() => import('@/screens/BoxOffice').then((m) => ({ default: m.BoxOffice })))
const Chooser = lazy(() => import('@/screens/Chooser').then((m) => ({ default: m.Chooser })))
const FilmSide = lazy(() => import('@/film/FilmSide').then((m) => ({ default: m.FilmSide })))
const BookSide = lazy(() => import('@/book/BookSide').then((m) => ({ default: m.BookSide })))

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/**
 * One account, two halves, and the door between them.
 *
 * The two sides share nothing but the account: separate logs, lists, groups
 * and people. Loading one never loads the other — each is its own chunk — so
 * someone who only ever reads never downloads the swipe deck for films.
 */
function Gate() {
  const { session, loading, profile, refreshProfile } = useAuth()

  // Seeded from localStorage so the chosen half is on screen immediately. The
  // profile is the real record but arrives a round trip later, and a chooser
  // that flashes up before deciding you did not need it is worse than nothing.
  const [side, setSide] = useState<Side | null>(rememberedSide)

  // Asking to see the two doors again, from inside. Separate from `side`
  // being unset, because it must not clear which half you were in — backing
  // out of the front door should leave you where you were standing.
  const [atFrontDoor, setAtFrontDoor] = useState(false)

  // Once the profile lands it wins — that is what makes the choice follow you
  // to another device.
  useEffect(() => {
    if (side === null && isSide(profile?.last_side)) setSide(profile.last_side as Side)
  }, [profile?.last_side, side])

  useEffect(() => {
    if (side) applyTheme(side)
  }, [side])

  function choose(next: Side) {
    setSide(next)
    setAtFrontDoor(false)
    rememberSide(next)
    applyTheme(next)
    // Best-effort: the local memory above already did the job, so a failed
    // write costs the choice on other devices and nothing on this one.
    void updateMyProfile({ last_side: next }).then(refreshProfile).catch(() => {})
  }

  if (loading) return <Curtain />

  if (!session) {
    return (
      <Screen>
        <BoxOffice />
      </Screen>
    )
  }

  if (side === null || atFrontDoor) {
    return (
      <Screen>
        <Chooser onPick={choose} onBack={side ? () => setAtFrontDoor(false) : undefined} />
      </Screen>
    )
  }

  return (
    <Screen>
      {side === 'film' ? (
        <FilmSide
          onSwitchSide={() => choose('book')}
          onFrontDoor={() => setAtFrontDoor(true)}
        />
      ) : (
        <BookSide
          onSwitchSide={() => choose('film')}
          onFrontDoor={() => setAtFrontDoor(true)}
        />
      )}
    </Screen>
  )
}
