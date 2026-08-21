import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

type Mode = 'signIn' | 'signUp'

/**
 * The front door — sign in and sign up, for both halves at once.
 *
 * It used to wear the film side's name, which stopped being true the moment
 * one account opened onto two societies: someone signing up to keep a reading
 * log was being greeted by a cinema. There is no third name to fall back on —
 * that was decided deliberately — so the entrance carries both, joined by an
 * ampersand, which is also the plainest way to say what is behind the door.
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
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12"
      style={{ backgroundColor: '#1a1416' }}
    >
      {/* One warm lamp over the entrance. A globe light hangs in the cinema
          foyer and in the bookshop window alike, so it belongs to both — where
          a strip of marquee bulbs belongs only to one. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          backgroundImage:
            'radial-gradient(60% 100% at 50% 0%, rgb(255 228 168 / 0.22) 0%, transparent 70%)',
        }}
      />

      {/* ---- The name plate over the door -------------------------------- */}
      <div
        className="relative mb-3 rounded-[3px] p-[5px]"
        style={{ backgroundColor: '#2a211d', boxShadow: '0 20px 44px -18px rgb(0 0 0 / 0.75)' }}
      >
        <div className="flex flex-col items-center bg-linear-to-b from-[#f4eddf] to-[#e6d9c2] px-9 py-4">
          <h1 className="type-marquee text-[1.7rem] leading-none text-[#5d1720]">{t('app.name')}</h1>
          <span className="type-script my-0.5 text-[1.35rem] leading-none text-[#8a6320]">
            &amp;
          </span>
          <span className="type-marquee text-[1.7rem] leading-none text-[#41513c]">
            {t('book.name')}
          </span>
        </div>

        {/* The brass rail under the plate — bar rail and cinema fitting both. */}
        <div className="mt-[5px] h-[3px] brass-rail" aria-hidden />
      </div>

      <p className="type-script mb-8 text-center text-[1.45rem] text-[#c2b8a5]">
        {t('auth.tagline')}
      </p>

      {/* ---- The desk ------------------------------------------------------
          Plain panelled wood rather than a bulb-lit ticket window: the point
          of this screen is that you have not chosen a side yet, so nothing on
          it should be furniture from one of them. */}
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-[21rem] rounded-[3px] p-2"
        style={{ backgroundColor: '#2a211d', boxShadow: '0 20px 44px -18px rgb(0 0 0 / 0.75)' }}
      >
        <div
          className="rounded-[2px] px-6 py-7 ring-1 ring-[#c9922e]/40"
          style={{ backgroundColor: '#f4eddf' }}
        >
          <div className="rule-pip mb-6">
            <span className="type-meta whitespace-nowrap" style={{ color: '#7a6d70' }}>
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
            <p role="alert" className="mt-4 text-[0.8125rem] leading-snug" style={{ color: '#b22a2a' }}>
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-4 text-[0.8125rem] leading-snug" style={{ color: '#4a3f42' }}>
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="type-marquee mt-6 w-full rounded-[2px] py-3.5 text-[15px] transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: '#2a211d', color: '#f4eddf' }}
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
            className="mt-4 w-full text-[0.8125rem] underline underline-offset-4"
            style={{ color: '#7a6d70' }}
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
      <span className="type-meta mb-1.5 block" style={{ color: '#7a6d70' }}>{label}</span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[2px] border px-3 py-2.5 text-[0.9375rem] outline-none transition-colors focus:border-[#c9922e] focus:ring-1 focus:ring-[#c9922e]/50"
        style={{ borderColor: '#dbcdb2', backgroundColor: '#ebe0cb', color: '#1a1416' }}
      />
      {hint && <span className="mt-1 block text-[0.7rem]" style={{ color: '#7a6d70' }}>{hint}</span>}
    </label>
  )
}
