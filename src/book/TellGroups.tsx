import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { postCurrentRead } from '@/lib/bookActivity'
import { errorMessage } from '@/lib/errors'

/**
 * Telling your groups what you have picked up.
 *
 * Always a deliberate act, never automatic: how far into a book you are stays
 * yours alone, and this posts the book and nothing else.
 *
 * It says what actually happened afterwards. The old version flipped to "your
 * groups know" the moment it was tapped, whether or not a row had been
 * written — and if you are in no book groups there is nobody to tell, which
 * looked exactly the same as it working.
 */
export function TellGroups({ bookId, className }: { bookId: number; className: string }) {
  const { t } = useTranslation()

  const [note, setNote] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function tell() {
    setBusy(true)
    setNote(null)
    try {
      const told = await postCurrentRead(bookId)
      if (told.groups === 0) {
        setNote(t('book.progress.noGroups'))
      } else {
        setDone(true)
        setNote(t('book.progress.toldN', { count: told.groups }))
      }
    } catch (err) {
      setNote(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void tell()}
        disabled={busy || done}
        className={`${className} disabled:opacity-60`}
      >
        {done ? t('book.progress.told') : t('book.progress.tellGroups')}
      </button>
      {note && <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-3">{note}</p>}
    </>
  )
}
