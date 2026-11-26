import type { ReactNode } from 'react'
import { rangePercentages } from '../../domain/profileMetrics'
import type { ResolvedMetric } from '../../domain/resolveMetric'
import type { MetricContext, Snapshot } from '../../types/snapshot'
import { formatUnit, formatValue } from '../map/mapLayers'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { Tooltip } from '../ui/Tooltip'
import { useT } from '../../locales/useT'

const statusVariant: Record<ResolvedMetric['status'], BadgeVariant> = {
  verified: 'verified',
  estimated: 'estimated',
  unavailable: 'missing',
}

export function MetricCell({ metric, snapshot, withUnit = true, context }: {
  metric: ResolvedMetric
  snapshot: Snapshot
  withUnit?: boolean
  context?: MetricContext
}) {
  const { language, t } = useT()
  const { value, unit, reason, status, period, sourceId, n, method } = metric
  const source = sourceId ? snapshot.manifest.sources[sourceId] : undefined
  const metadata = [
    t('profile.metricSource', { source: source?.label ?? t('profile.noSource') }),
    source?.locator ? t('profile.locator', { locator: source.locator }) : null,
    t('profile.metricPeriod', { period: period || t('profile.noSource') }),
    t('profile.sampleSize', { n: n ?? t('profile.noSource') }),
    t('profile.method', { method: method ?? t('profile.noSource') }),
    reason ? t('profile.reason', { reason }) : null,
  ].filter(Boolean).join(' · ')

  let display: ReactNode
  if (value === null) {
    display = <span className="font-medium text-app-text-muted">{t('status.noData')}</span>
  } else if (typeof value === 'number') {
    display = <span className="font-semibold text-app-text">
      {formatValue(value, language)}{withUnit && ` ${formatUnit(unit, language)}`}
    </span>
  } else {
    const contextualHighs = context
      ? snapshot.evidence.flatMap(row =>
          row.evidenceState === 'available' &&
          row.period === context.period &&
          row.segment === context.segment &&
          row.study === context.study
            ? [row.answers.wtp.high]
            : [],
        )
      : []
    const scaleMax = contextualHighs.reduce((max, high) => Math.max(max, high), value.high)
    const range = rangePercentages(value.low, value.high, scaleMax)
    const unitLabel = withUnit ? formatUnit(unit, language) : ''
    const rangeLabel = `${formatValue(value.low, language)} ${t('common.to')} ${formatValue(value.high, language)} ${unitLabel}`.trim()
    display = (
      <div
        role="img"
        tabIndex={0}
        aria-label={t('profile.wtpRange', { range: rangeLabel })}
        className="max-w-56 space-y-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        <div className="h-2 overflow-hidden rounded-full bg-app-surface-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ marginLeft: `${range.start}%`, width: `${Math.max(range.width, 1)}%` }}
          />
        </div>
        <div className="text-sm font-semibold text-app-text">
          {formatValue(value.low, language)}–{formatValue(value.high, language)} {unitLabel}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Tooltip label={metadata}>
        {value === null
          ? <span tabIndex={0} className="inline-block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">{display}</span>
          : typeof value === 'number'
            ? <span tabIndex={0} className="inline-block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">{display}</span>
            : display}
      </Tooltip>
      <div className="flex flex-wrap items-center gap-2 text-xs text-app-text-muted">
        <span>{t('profile.periodShort', { period: period || '—' })}</span>
        <Badge variant={statusVariant[status]}>{t(status === 'verified' ? 'status.verified' : status === 'estimated' ? 'status.estimated' : 'status.missing')}</Badge>
      </div>
      {reason && <p className="text-xs text-app-text-muted">{reason}</p>}
    </div>
  )
}
