import { useState } from 'react'
import { downloadElementAsPng } from '../../utils/exportImage'
import { Button } from '../ui/Button'
import { useT } from '../../locales/useT'

export function PngExportButton({ target, filename, label }: {
  target: () => HTMLElement | null
  filename: string
  label?: string
}) {
  const { t } = useT()
  const [error, setError] = useState('')

  async function exportPng() {
    const element = target()
    if (!element) {
      setError(t('export.pngMissing'))
      return
    }
    try {
      await downloadElementAsPng(element, filename)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? t('export.pngFailed', { message: reason.message }) : t('export.pngFailedFallback'))
    }
  }

  return (
    <div className="no-print mt-2">
      <Button type="button" variant="secondary" className="text-xs" onClick={exportPng}>{label ?? t('decision.exportPng')}</Button>
      {error && <p role="alert" className="mt-1 text-xs text-status-fail">{error}</p>}
    </div>
  )
}
