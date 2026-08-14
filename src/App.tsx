import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BottomNav, type View } from '@/components/BottomNav'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AuthProvider, useAuth } from '@/lib/auth'
import { BoxOffice } from '@/screens/BoxOffice'
import { Groups } from '@/screens/Groups'
import { Lobby } from '@/screens/Lobby'
import { LogViewing } from '@/screens/LogViewing'
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
  // Remounts the Lobby after a save, so a newly logged film feeds the
  // recommender straight away rather than on next reload.
  const [lobbyKey, setLobbyKey] = useState(0)

  if (loading) return <Curtain />
  if (!session) return <BoxOffice />

  return (
    <>
      {view === 'lobby' && <Lobby key={lobbyKey} />}
      {view === 'lists' && <Watchlists />}
      {view === 'groups' && <Groups />}
      {view === 'log' && (
        <LogViewing
          onDone={() => {
            setView('lobby')
            setLobbyKey((k) => k + 1)
          }}
        />
      )}

      <BottomNav current={view} onNavigate={setView} />
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
