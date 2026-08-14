import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AuthProvider, useAuth } from '@/lib/auth'
import { BoxOffice } from '@/screens/BoxOffice'
import { Lobby } from '@/screens/Lobby'
import { LogViewing } from '@/screens/LogViewing'

export default function App() {
  return (
    <AuthProvider>
      <Gate />
      <ThemeSwitcher />
    </AuthProvider>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  const [logging, setLogging] = useState(false)
  // Remounts the Lobby after a save, so a newly logged film feeds the
  // recommender straight away rather than on next reload.
  const [lobbyKey, setLobbyKey] = useState(0)

  if (loading) return <Curtain />
  if (!session) return <BoxOffice />

  if (logging) {
    return (
      <LogViewing
        onDone={() => {
          setLogging(false)
          setLobbyKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <>
      <Lobby key={lobbyKey} />
      <LogButton onClick={() => setLogging(true)} />
    </>
  )
}

/** Sits opposite the theme control so the two never overlap. */
function LogButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-marquee fixed bottom-4 left-4 z-50 rounded-full bg-velvet-600 px-5 py-3 text-[13px] text-plate shadow-frame transition-colors hover:bg-velvet-700"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      + {t('log.open')}
    </button>
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
