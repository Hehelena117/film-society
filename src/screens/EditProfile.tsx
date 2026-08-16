import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n'
import { updateMyProfile, uploadAvatar } from '@/lib/profiles'

/** Countries we hold certifications and streaming availability for. */
const COUNTRIES = ['DK', 'GB', 'US', 'ES', 'DE', 'FR', 'SE', 'NO', 'NL', 'IT'] as const

export function EditProfile({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const { profile, refreshProfile } = useAuth()

  const [bio, setBio] = useState(profile?.bio ?? '')
  const [country, setCountry] = useState(profile?.country ?? 'DK')
  const [language, setLanguage] = useState(profile?.language ?? 'en')
  const [useNotes, setUseNotes] = useState(profile?.use_notes_for_recommendations ?? false)
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function pickAvatar(file: File) {
    setUploading(true)
    setError(null)
    try {
      setAvatar(await uploadAvatar(file))
      await refreshProfile()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateMyProfile({
        bio: bio.trim() || null,
        country,
        language,
        use_notes_for_recommendations: useNotes,
      })
      // Country changes which certifications and providers we fetch, and
      // language changes which translation — so apply it immediately rather
      // than waiting for a reload.
      if (language !== i18n.resolvedLanguage) await i18n.changeLanguage(language)
      await refreshProfile()
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('edit.title')} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {/* ---- Avatar ------------------------------------------------------ */}
        <div className="flex flex-col items-center">
          <div className="size-24 overflow-hidden rounded-full border border-rule-strong bg-ground-2">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="type-script flex h-full items-center justify-center text-2xl text-ink-3">
                {profile?.username?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pickAvatar(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="type-meta mt-3 text-accent underline underline-offset-4 disabled:opacity-60"
          >
            {uploading ? t('auth.working') : t('edit.changeAvatar')}
          </button>
          <p className="mt-1 text-[0.7rem] text-ink-3">{t('edit.avatarHint')}</p>
        </div>

        <label className="mt-8 block">
          <span className="type-meta mb-2 block text-ink-3">{t('edit.bio')}</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder={t('edit.bioPlaceholder')}
            className="w-full resize-y rounded-[2px] border border-rule bg-ground-2 px-3.5 py-3 text-[0.9375rem] leading-relaxed text-ink outline-none focus:border-brass-600"
          />
          <span className="mt-1 block text-right text-[0.7rem] text-ink-3">{bio.length}/300</span>
        </label>

        <label className="mt-4 block">
          <span className="type-meta mb-2 block text-ink-3">{t('edit.country')}</span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-[0.75rem] text-ink-3">{t('edit.countryHint')}</span>
        </label>

        <label className="mt-4 block">
          <span className="type-meta mb-2 block text-ink-3">{t('edit.language')}</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`edit.lang.${l}`)}
              </option>
            ))}
          </select>
        </label>

        {/* ---- Notes → recommendations ------------------------------------
            The one setting here that hands data to someone else, so it says
            plainly what it does. Off until switched on, never the reverse. */}
        <div className="mt-8 rounded-[2px] border border-rule bg-ground-2 px-4 py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={useNotes}
              onChange={(e) => setUseNotes(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-velvet-600"
            />
            <span>
              <span className="type-meta block text-ink">{t('edit.useNotes')}</span>
              <span className="mt-1.5 block text-[0.75rem] leading-relaxed text-ink-3">
                {t('edit.useNotesHint')}
              </span>
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="type-marquee mt-8 w-full rounded-[2px] bg-velvet-600 py-3.5 text-[14px] text-plate hover:bg-velvet-700 disabled:opacity-60"
        >
          {busy ? t('auth.working') : t('edit.save')}
        </button>

        {saved && (
          <p role="status" className="type-meta mt-3 text-center text-accent">
            {t('edit.saved')}
          </p>
        )}
      </main>
    </div>
  )
}
