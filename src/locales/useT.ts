import { useContext } from 'react'
import { I18nContext } from './I18nContext'

export function useT() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useT must be used within I18nProvider.')
  return value
}
