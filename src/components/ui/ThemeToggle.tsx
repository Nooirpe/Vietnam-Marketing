import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './Button'
import { Tooltip } from './Tooltip'

type ThemePreference = 'system' | 'light' | 'dark'

function getStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem('vmi-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch (error) {
    console.warn('Unable to read the saved theme preference.', error)
  }
  return 'system'
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredPreference)
  const [systemDark, setSystemDark] = useState(getSystemTheme)
  const dark = preference === 'system' ? systemDark : preference === 'dark'

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemDark(query.matches)
    query.addEventListener('change', updateSystemTheme)
    return () => query.removeEventListener('change', updateSystemTheme)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    window.dispatchEvent(new Event('vmi-theme-change'))
  }, [dark])

  function toggle() {
    const next = dark ? 'light' : 'dark'
    setPreference(next)
    try {
      window.localStorage.setItem('vmi-theme', next)
    } catch (error) {
      console.warn('Unable to save the theme preference.', error)
    }
  }

  const label = dark ? 'Sáng' : 'Tối'
  return (
    <Tooltip label={`Chuyển sang giao diện ${label.toLowerCase()}`}>
      <Button type="button" variant="secondary" className="theme-toggle" onClick={toggle}
        aria-label={`Chuyển sang giao diện ${label.toLowerCase()}`}>
        {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        <span>{label}</span>
      </Button>
    </Tooltip>
  )
}
