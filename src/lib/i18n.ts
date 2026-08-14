import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from '@/locales/en.json'
import da from '@/locales/da.json'
import es from '@/locales/es.json'

export const SUPPORTED_LANGUAGES = ['en', 'da', 'es'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * Maps our UI language to the TMDB `language` query parameter. TMDB serves its
 * own community translations and falls back to English when a title has none —
 * which is exactly the behaviour we want, so we never translate TMDB text
 * ourselves (doing so would create a derivative work; see docs/DECISIONS.md).
 */
export const TMDB_LOCALE: Record<SupportedLanguage, string> = {
  en: 'en-US',
  da: 'da-DK',
  es: 'es-ES',
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      da: { translation: da },
      es: { translation: es },
    },
    supportedLngs: SUPPORTED_LANGUAGES,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
