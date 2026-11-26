import { createContext } from 'react'
import { vi } from './vi'

export type Language = 'vi' | 'en'
export type TranslationKey = keyof typeof vi

export interface I18nValue {
  language: Language
  storageBlocked: boolean
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nValue | null>(null)
