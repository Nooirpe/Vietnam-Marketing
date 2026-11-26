import { compareWithMedian, median, selectPeerUnits } from '../../domain/profileMetrics'
import { resolveMetric, type ResolvedMetric } from '../../domain/resolveMetric'
import type { MetricContext, Snapshot } from '../../types/snapshot'
import { formatUnit, formatValue } from '../map/mapLayers'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { MetricCell } from './MetricCell'
import { Panel } from '../ui/Panel'
import { Tooltip } from '../ui/Tooltip'
import { useT } from '../../locales/useT'

const kpiDefinitions = [
  { code: 'population', labelKey: 'map.layerPopulation' },
  { code: 'population_density', labelKey: 'map.layerDensity' },
  { code: 'spending', labelKey: 'map.layerSpending' },
  { code: 'poi_density', labelKey: 'map.layerCompetitors' },
  { code: 'unmet', labelKey: 'map.layerUnmet' },
] as const

const comparisonArrows = {
  above: '↑',
  below: '↓',
  equal: '→',
  unavailable: '—',
}

const statusVariants: Record<ResolvedMetric['status'], BadgeVariant> = {
  verified: 'verified',
  estimated: 'estimated',
  unavailable: 'missing',
}

export function ProfileKpis({ snapshot, geoId, context }: {
  snapshot: Snapshot
  geoId: string
  context: MetricContext
}) {
  const { language, t } = useT()
  const area = snapshot.unitsById.get(geoId)
  if (!area || area.level === 'country') return null

  const peers = selectPeerUnits(snapshot.units, area)
  const statusLabel = (status: ResolvedMetric['status']) =>
    t(status === 'verified' ? 'status.verified' : status === 'estimated' ? 'status.estimated' : 'status.missing')
  return (
    <section aria-label={t('profile.kpis')} className="grid gap-3 min-[480px]:grid-cols-2 xl:grid-cols-5">
      {kpiDefinitions.map(({ code, labelKey }) => {
        const metric = resolveMetric(snapshot, area.id, code, context)
        const value = typeof metric.value === 'number' ? metric.value : null
        const peerMetrics = peers.map(peer => ({
          peer,
          metric: resolveMetric(snapshot, peer.id, code, context),
        }))
        const peerValues = peerMetrics.flatMap(({ metric: peerMetric }) =>
          typeof peerMetric.value === 'number' ? [peerMetric.value] : [],
        )
        const peerMedian = median(peerValues)
        const comparison = compareWithMedian(value, peerMedian)
        const peerStatus: ResolvedMetric['status'] = peerMedian === null
          ? 'unavailable'
          : peerValues.length !== peers.length || peerMetrics.some(({ metric: peerMetric }) => peerMetric.value !== null && peerMetric.status === 'estimated')
            ? 'estimated'
            : 'verified'
        const comparisonStatus: ResolvedMetric['status'] = comparison.direction === 'unavailable'
          ? 'unavailable'
          : metric.status === 'estimated' || peerStatus === 'estimated' ? 'estimated' : 'verified'
        const delta = comparison.difference === null
          ? null
          : `${comparison.difference > 0 ? '+' : ''}${formatValue(comparison.difference, language)} ${formatUnit(metric.unit, language)}`.trim()
        const peerDetails = peerMetrics.map(({ peer, metric: peerMetric }) => {
          const source = peerMetric.sourceId ? snapshot.manifest.sources[peerMetric.sourceId] : undefined
          const peerValue = typeof peerMetric.value === 'number' ? formatValue(peerMetric.value, language) : t('profile.noData')
          return `${peer.name}: ${peerValue} · ${statusLabel(peerMetric.status)} · ${t('profile.metricSource', { source: source?.label ?? t('profile.noSource') })}${source?.locator ? ` (${source.locator})` : ''} · ${t('profile.metricPeriod', { period: peerMetric.period || '—' })} · ${t('profile.sampleSize', { n: peerMetric.n ?? t('profile.noSource') })} · ${t('profile.method', { method: peerMetric.method ?? t('profile.noSource') })}`
        }).join(' ; ')
        const comparisonDetails = t('profile.comparisonDetails', {
          area: area.name, included: peerValues.length, total: peers.length, details: peerDetails,
        })

        return (
          <Panel key={code} className="space-y-2 p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-app-text-muted">
              {snapshot.indicatorsByCode.get(code)?.name ?? t(labelKey)}
            </h2>
            <MetricCell metric={metric} snapshot={snapshot} context={context} />
            <div className="space-y-1 text-xs text-app-text-muted">
              <div className="flex flex-wrap items-start gap-1">
                <Tooltip label={comparisonDetails}>
                  <span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
                    <span aria-hidden="true" className="font-bold">{comparisonArrows[comparison.direction]}</span>{' '}
                    {comparison.direction === 'unavailable'
                      ? t('profile.peerMissing')
                      : `${delta} ${t(comparison.direction === 'above' ? 'profile.aboveMedian' : comparison.direction === 'below' ? 'profile.belowMedian' : 'profile.equalMedian')}`}
                  </span>
                </Tooltip>
                <Badge variant={statusVariants[comparisonStatus]}>{statusLabel(comparisonStatus)}</Badge>
              </div>
              {peerMedian !== null && (
                <div className="flex flex-wrap items-center gap-1">
                  <Tooltip label={t('profile.medianDetails', { included: peerValues.length, total: peers.length, details: peerDetails })}>
                    <span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
                      {t('profile.median', { value: formatValue(peerMedian, language), unit: formatUnit(metric.unit, language) })}
                    </span>
                  </Tooltip>
                  <Badge variant={statusVariants[peerStatus]}>{statusLabel(peerStatus)}</Badge>
                </div>
              )}
            </div>
          </Panel>
        )
      })}
    </section>
  )
}
