import type { ReactNode } from 'react'
import type { resolveMetric } from '../../domain/resolveMetric'
import type { Snapshot } from '../../types/snapshot'
import { findBin, formatBin, formatUnit, formatValue, type LegendBin } from './mapLayers'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useT } from '../../locales/useT'

type MetricValue = ReturnType<typeof resolveMetric>
type GeoUnit = Snapshot['units'][number]
type Period = Snapshot['manifest']['periods'][string]
type Source = Snapshot['manifest']['sources'][string]

const statusKeys = {
  verified: 'map.statusVerified',
  estimated: 'map.statusEstimated',
  unavailable: 'map.statusUnavailable',
} as const
const statusVariant: Record<MetricValue['status'], BadgeVariant> = {
  verified: 'verified',
  estimated: 'estimated',
  unavailable: 'missing',
}

interface AreaPopupProps {
  area: GeoUnit
  isDemo: boolean
  geometryMissing?: boolean
  label: string
  metric: MetricValue | null
  period?: Period
  source?: Source
  surveySegment?: string
  trend?: ReactNode
  shortlistAction?: ReactNode
  bins: readonly LegendBin[]
  onClose: () => void
  action: ReactNode
}

export function AreaPopup({
  area,
  isDemo,
  geometryMissing,
  label,
  metric,
  period,
  source,
  surveySegment,
  trend,
  shortlistAction,
  bins,
  onClose,
  action,
}: AreaPopupProps) {
  const { language, t } = useT()
  const bin = typeof metric?.value === 'number' ? findBin(bins, metric.value) : undefined
  const value = typeof metric?.value === 'number' ? formatValue(metric.value, language) : null

  return (
    <section aria-label={t('map.popupTitle')} className="relative min-w-48 max-w-xs text-sm text-app-text">
      <Button type="button" variant="ghost" aria-label={t('map.closePopup')} onClick={onClose}
        className="absolute top-0 right-0 !size-6 !min-h-0 !p-0 text-xl text-app-text-muted hover:text-app-text">
        ×
      </Button>
      <h3 className="pr-8 text-base font-semibold leading-snug">{area.name}</h3>
      <dl className="my-2 space-y-1 break-words">
        <div><dt className="inline font-semibold">{t('map.adminCode')} </dt><dd className="inline">{area.code}</dd></div>
        {metric && (
          <>
            <div><dt className="inline font-semibold">{label} </dt>
              <dd className="inline">{value === null ? t('map.valueMissing') : `${value} ${formatUnit(metric.unit, language)}`}</dd>
            </div>
            {bin && <div><dt className="inline font-semibold">{t('map.legendRange')} </dt><dd className="inline">{formatBin(bin, language)}</dd></div>}
            <div><dt className="inline font-semibold">{t('map.measurementPeriod')} </dt>
              <dd className="inline">{metric.period}{period && ` (${period.start} – ${period.end})`}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="font-semibold">{t('map.status')}</dt>
              <dd><Badge variant={statusVariant[metric.status]}>{t(statusKeys[metric.status])}</Badge></dd>
            </div>
            <div><dt className="inline font-semibold">{t('map.source')} </dt>
              <dd className="inline">{source ? `${source.label} · ${source.locator}` : t('map.sourceMissing')}</dd>
            </div>
            {surveySegment && (
              <>
                <div><dt className="inline font-semibold">{t('map.segmentLabel')} </dt><dd className="inline">
                  {surveySegment === 'urban_adults' ? t('common.survey.urban_adults') : surveySegment}
                </dd></div>
                {metric.n !== null && <div><dt className="inline font-semibold">{t('map.sampleSize')} </dt><dd className="inline">n = {metric.n}</dd></div>}
                {metric.method && <div><dt className="inline font-semibold">{t('map.method')} </dt><dd className="inline">{metric.method}</dd></div>}
              </>
            )}
            {metric.reason && <div><dt className="inline font-semibold">{t('map.reason')} </dt><dd className="inline">{metric.reason}</dd></div>}
          </>
        )}
      </dl>
      {trend}
      {isDemo && <Badge variant="estimated">{t('app.demo')}</Badge>}
      {geometryMissing && <div className="mt-2 text-sm text-app-text-muted">{t('map.geometryMissing')}</div>}
      <div className="mt-3 flex flex-wrap gap-2">{shortlistAction}{action}</div>
    </section>
  )
}
