import { useTranslation } from 'react-i18next'

import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AuthProvider, useAuth } from '@/lib/auth'
import { BoxOffice } from '@/screens/BoxOffice'
import { Lobby } from '@/screens/Lobby'

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
  if (loading) return <Curtain />
  return session ? <Lobby /> : <BoxOffice />
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
