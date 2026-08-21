import { Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/** Holds the ground while a screen's chunk arrives. */
export function Screen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Curtain />}>{children}</Suspense>
}

/** Also shown while we work out whether there is a stored session. */
export function Curtain() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center wall-ground texture-wall">
      <p className="type-script text-2xl text-ink-3">{t('app.name')}</p>
    </div>
  )
}
