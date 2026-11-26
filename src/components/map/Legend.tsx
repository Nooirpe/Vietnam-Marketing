import { formatBin, formatUnit, type LegendBin } from './mapLayers'
import { useT } from '../../locales/useT'

interface LegendProps {
  label: string
  unit: string | null
  bins: readonly LegendBin[]
  hasMissing: boolean
  hasExcluded: boolean
  enabled: boolean
}

export function Legend({ label, unit, bins, hasMissing, hasExcluded, enabled }: LegendProps) {
  const { language, t } = useT()
  return (
    <section aria-label={t('map.legend')} className="border-t border-app-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <h3 className="font-semibold text-app-text">{label}</h3>
        {unit && <span className="text-app-text-muted">{formatUnit(unit, language)}</span>}
        {bins.length > 1 && <span className="text-app-text-muted">{t('map.increasingValues')}</span>}
      </div>
      {enabled && bins.length === 0 && (
        <p className="mt-2 text-sm text-app-text-muted">{t('map.noLayerData')}</p>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-app-text">
        {bins.map((bin) => (
          <li key={bin.lower} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-4 rounded-xs border border-app-border" style={{ background: bin.color }} />
            {formatBin(bin, language)}
          </li>
        ))}
        {hasMissing && (
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="vmi-missing-key h-3 w-4 rounded-xs" />
            {t('map.missingData')}
          </li>
        )}
        {hasExcluded && (
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-4 rounded-xs border border-dashed border-app-text-muted" />
            {t('map.outsideFilter')}
          </li>
        )}
      </ul>
    </section>
  )
}
