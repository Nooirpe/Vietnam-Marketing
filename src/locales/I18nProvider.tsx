import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { en } from './en'
import { vi } from './vi'
import { I18nContext } from './I18nContext'
import type { Language, TranslationKey } from './I18nContext'

const storageKey = 'vmi.language'
const dictionaries = { vi, en }

export type { Language } from './I18nContext'

function storedLanguage(): { language: Language; storageBlocked: boolean } {
  try {
    return { language: window.localStorage.getItem(storageKey) === 'en' ? 'en' : 'vi', storageBlocked: false }
  } catch {
    return { language: 'vi', storageBlocked: true }
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState(storedLanguage)
  const { language, storageBlocked } = stored
  const setLanguage = useCallback((next: Language) => {
    setStored(current => ({ ...current, language: next }))
    try {
      window.localStorage.setItem(storageKey, next)
      setStored(current => ({ ...current, storageBlocked: false }))
    } catch {
      setStored(current => ({ ...current, storageBlocked: true }))
    }
  }, [])
  const t = useCallback((key: TranslationKey, values?: Record<string, string | number>) => {
    let text = dictionaries[language][key]
    for (const [name, value] of Object.entries(values ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }, [language])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('app.title')
  }, [language, t])

  const value = useMemo(() => ({ language, storageBlocked, setLanguage, t }),
    [language, storageBlocked, setLanguage, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
