import { resolveMetricTrend } from '../../domain/metricTrend'
import type { MetricTrendPoint } from '../../domain/metricTrend'
import type { MetricContext, Snapshot } from '../../types/snapshot'
import { formatUnit, formatValue } from '../map/mapLayers'
import { useT } from '../../locales/useT'

export function MetricSparkline({ snapshot, geoId, code, context, label }: {
  snapshot: Snapshot
  geoId: string
  code: string
  context: MetricContext
  label: string
}) {
  const { language, t } = useT()
  const points = resolveMetricTrend(snapshot, geoId, code, context)
  const available = points.filter((point): point is MetricTrendPoint & { value: number } => point.value !== null)
  if (available.length < 2) return null

  const width = 160
  const height = 36
  const padding = 3
  const values = available.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const x = (index: number) => padding + (width - padding * 2) * index / Math.max(points.length - 1, 1)
  const y = (value: number) => max === min
    ? height / 2
    : height - padding - (value - min) / (max - min) * (height - padding * 2)

  const segments: string[] = []
  let segment: string[] = []
  points.forEach((point, index) => {
    if (point.value === null) {
      if (segment.length > 1) segments.push(segment.join(' '))
      segment = []
      return
    }
    segment.push(`${x(index)},${y(point.value)}`)
  })
  if (segment.length > 1) segments.push(segment.join(' '))

  const unit = formatUnit(snapshot.indicatorsByCode.get(code)?.unit ?? null, language)
  return (
    <figure className="mt-2 flex items-center gap-2">
      <svg
        role="img"
        aria-label={t('trend.label', { label, count: available.length })}
        viewBox={`0 0 ${width} ${height}`}
        className="h-9 w-40 shrink-0 overflow-visible text-brand-700"
      >
        {segments.map((coordinates, index) => (
          <polyline key={index} points={coordinates} fill="none" stroke="currentColor" strokeWidth="2" />
        ))}
        {points.map((point, index) => point.value === null ? null : (
          <circle key={point.period} cx={x(index)} cy={y(point.value)} r="2.5" fill="currentColor" />
        ))}
      </svg>
      <figcaption className="text-xs text-app-text-muted">
        {t('trend.caption', { count: available.length })}
      </figcaption>
      <table className="sr-only">
        <caption>{t('trend.title', { label })}</caption>
        <thead><tr><th scope="col">{t('trend.period')}</th><th scope="col">{t('trend.value')}</th><th scope="col">{t('trend.status')}</th></tr></thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.period}>
              <th scope="row">{point.period}</th>
              <td>{point.value === null ? t('status.noData') : `${formatValue(point.value, language)} ${unit}`.trim()}</td>
              <td>{t(point.status === 'verified' ? 'status.verified' : point.status === 'estimated' ? 'status.estimated' : 'status.missing')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
