import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/lib/auth'

type Mode = 'signIn' | 'signUp'

/**
 * The box office — sign in and sign up.
 *
 * Same bulb-lit frame as the poster surrounds in the Lobby, so the first
 * screen already teaches the visual language of the rest of the app.
 */
export function BoxOffice() {
  const { t } = useTranslation()
  const { signIn, signUp } = useAuth()

  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)

    try {
      if (mode === 'signUp') {
        await signUp(email, password, username)
        // Whether a session exists now depends on the project's email
        // confirmation setting, so say something true either way.
        setNotice(t('auth.checkEmail'))
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center wall-ground texture-wall px-6 py-12">
      {/* ---- Marquee ------------------------------------------------------ */}
      <div className="relative mb-3 rounded-[3px] bg-frame px-1.5 py-1.5 shadow-frame">
        <div className="pointer-events-none absolute inset-x-3 top-[3px] h-2 bulbs-h bulb-breathe" />
        <div className="pointer-events-none absolute inset-x-3 bottom-[3px] h-2 bulbs-h bulb-breathe bulb-offset-2" />
        <div className="bg-linear-to-b from-plate to-plate-2 px-8 py-3.5">
          <h1 className="type-marquee text-[2rem] text-velvet-600">{t('app.name')}</h1>
        </div>
      </div>

      <p className="type-script mb-9 text-[1.5rem] text-ink-2">{t('auth.tagline')}</p>

      {/* ---- The ticket window -------------------------------------------- */}
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-[21rem] rounded-[3px] bg-frame p-2 shadow-frame"
      >
        <div className="pointer-events-none absolute inset-y-3 left-[3px] w-2 bulbs-v bulb-breathe bulb-offset-1" />
        <div className="pointer-events-none absolute inset-y-3 right-[3px] w-2 bulbs-v bulb-breathe bulb-offset-3" />

        <div className="rounded-[2px] bg-ground px-6 py-7 ring-1 ring-brass-600/40">
          <div className="rule-pip mb-6">
            <span className="type-meta whitespace-nowrap text-ink-3">
              {t(mode === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
            </span>
          </div>

          <div className="flex flex-col gap-3.5">
            {mode === 'signUp' && (
              <Field
                label={t('auth.username')}
                hint={t('auth.usernameHint')}
                value={username}
                onChange={setUsername}
                autoComplete="username"
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]+"
                required
              />
            )}

            <Field
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />

            <Field
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[0.8125rem] leading-snug text-velvet-500">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-4 text-[0.8125rem] leading-snug text-ink-2">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="type-marquee mt-6 w-full rounded-[2px] bg-velvet-600 py-3.5 text-[15px] text-plate transition-colors hover:bg-velvet-700 disabled:opacity-60"
          >
            {busy ? t('auth.working') : t(mode === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn')
              setError(null)
              setNotice(null)
            }}
            className="mt-4 w-full text-[0.8125rem] text-ink-3 underline underline-offset-4 hover:text-ink-2"
          >
            {t(mode === 'signIn' ? 'auth.noAccount' : 'auth.haveAccount')}
          </button>
        </div>
      </form>
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  minLength?: number
  maxLength?: number
  pattern?: string
  required?: boolean
}

function Field({ label, hint, value, onChange, type = 'text', ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="type-meta mb-1.5 block text-ink-3">{label}</span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors focus:border-brass-600 focus:ring-1 focus:ring-brass-600/50"
      />
      {hint && <span className="mt-1 block text-[0.7rem] text-ink-3">{hint}</span>}
    </label>
  )
}
