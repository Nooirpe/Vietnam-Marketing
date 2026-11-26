import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bar, Radar } from 'react-chartjs-2'
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale,
  PointElement, RadarController, RadialLinearScale, Tooltip as ChartTooltip,
} from 'chart.js'
import type { MetricContext, GeoUnit, Snapshot } from '../../types/snapshot'
import { normalizeMinMaxValues } from '../../domain/normalizeMinMax'
import { resolveMetric, type ResolvedMetric } from '../../domain/resolveMetric'
import { isScalarIndicator } from '../../domain/filterAreas'
import { formatUnit, formatValue } from '../map/mapLayers'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { Panel } from '../ui/Panel'
import { Select } from '../ui/Select'
import { Tooltip } from '../ui/Tooltip'
import { useReducedMotion } from '../ui/useReducedMotion'
import { PngExportButton } from '../common/PngExportButton'
import { useT } from '../../locales/useT'
import { indicatorLabel } from '../../locales/translate'

ChartJS.register(
  BarElement, CategoryScale, LinearScale, ChartTooltip, Legend, RadarController, RadialLinearScale,
  PointElement, LineElement, Filler,
)

const radarIndicators = [
  { code: 'population', labelKey: 'map.layerPopulation', direction: 'benefit' },
  { code: 'population_density', labelKey: 'map.layerDensity', direction: 'benefit' },
  { code: 'spending', labelKey: 'map.layerSpending', direction: 'benefit' },
  { code: 'poi_density', labelKey: 'map.layerCompetitors', direction: 'cost' },
  { code: 'unmet', labelKey: 'map.layerUnmet', direction: 'benefit' },
] as const

const radarColors = [
  { line: '#0f766e', fill: 'rgba(15, 118, 110, 0.18)' },
  { line: '#6d28d9', fill: 'rgba(109, 40, 217, 0.16)' },
  { line: '#b45309', fill: 'rgba(180, 83, 9, 0.16)' },
]

const metricStatusVariants: Record<ResolvedMetric['status'], BadgeVariant> = {
  verified: 'verified',
  estimated: 'estimated',
  unavailable: 'missing',
}

function AlternativeTable({ caption, columns, rows }: {
  caption: string
  columns: string[]
  rows: ReactNode[][]
}) {
  const { t } = useT()
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium text-brand-700">{t('compare.alternativeTable')}</summary>
      <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-app-border">
              {columns.map(column => <th key={column} scope="col" className="p-2">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-app-border">
                {row.map((cell, cellIndex) => cellIndex === 0
                  ? <th key={cellIndex} scope="row" className="p-2 font-medium">{cell}</th>
                  : <td key={cellIndex} className="p-2">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function MetricTableValue({ metric, value, details }: {
  metric: ResolvedMetric
  value: string
  details: string
}) {
  const { t } = useT()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip label={details}>
        <span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
          {value}
        </span>
      </Tooltip>
      <Badge variant={metricStatusVariants[metric.status]}>
        {t(metric.status === 'verified' ? 'status.verified' : metric.status === 'estimated' ? 'status.estimated' : 'status.missing')}
      </Badge>
    </div>
  )
}

export function ComparisonCharts({ snapshot, areas, context }: { snapshot: Snapshot; areas: GeoUnit[]; context: MetricContext }) {
  const { language, t } = useT()
  const [, setThemeRevision] = useState(0)
  const radarRef = useRef<HTMLDivElement>(null)
  const metricChartRef = useRef<HTMLDivElement>(null)
  const channelChartRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    const updateTheme = () => setThemeRevision(revision => revision + 1)
    window.addEventListener('vmi-theme-change', updateTheme)
    return () => window.removeEventListener('vmi-theme-change', updateTheme)
  }, [])
  const scalar = snapshot.indicators.filter(isScalarIndicator)
  const [code, setCode] = useState('population')
  const indicator = scalar.find(item => item.code === code) ?? scalar[0]
  if (!indicator) return null
  const indicatorName = indicatorLabel(indicator.code, indicator.name, t)

  const labels = areas.map(area => area.name)
  const metrics = (key: string) => areas.map(area => resolveMetric(snapshot, area.id, key, context))
  const toValues = (items: ResolvedMetric[]) => items.map(({ value }) => typeof value === 'number' ? value : null)
  const selected = metrics(indicator.code)
  const online = metrics('online')
  const offline = metrics('offline')
  const radarMetrics = radarIndicators.map(({ code: metricCode }) => metrics(metricCode))
  const radarValues = radarIndicators.map(({ direction }, axisIndex) =>
    normalizeMinMaxValues(toValues(radarMetrics[axisIndex]), direction),
  )
  const chartText = getComputedStyle(document.documentElement).getPropertyValue('--app-chart-text').trim() || '#334155'
  const chartGrid = getComputedStyle(document.documentElement).getPropertyValue('--app-chart-grid').trim() || '#cbd5e1'
  const chartBrand = getComputedStyle(document.documentElement).getPropertyValue('--app-action').trim() || '#14584f'
  const chartSurface = getComputedStyle(document.documentElement).getPropertyValue('--app-surface').trim() || '#ffffff'
  const chartNeutral = document.documentElement.dataset.theme === 'dark' ? '#94a3b8' : '#64748b'
  const chartFont = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'sans-serif'
  function tooltipLines(metric: ResolvedMetric) {
    const source = metric.sourceId ? snapshot.manifest.sources[metric.sourceId] : undefined
    return [
      t('compare.tooltipStatus', {
        period: metric.period || '—',
        status: t(metric.status === 'verified' ? 'status.verified' : metric.status === 'estimated' ? 'status.estimated' : 'status.noData'),
      }),
      `${t('compare.tooltipSource', { source: source?.label ?? t('profile.noSource') })}${source?.locator ? ` · ${source.locator}` : ''}`,
      t('compare.tooltipSample', { n: metric.n ?? t('profile.noSource'), method: metric.method ?? t('profile.noSource') }),
      ...(metric.reason ? [t('compare.tooltipReason', { reason: metric.reason })] : []),
    ]
  }
  const metricTableValue = (metric: ResolvedMetric, withUnit: boolean) => {
    const value = typeof metric.value === 'number'
      ? `${formatValue(metric.value, language)}${withUnit ? ` ${formatUnit(metric.unit, language)}` : ''}`
      : t('profile.noData')
    return <MetricTableValue metric={metric} value={value} details={tooltipLines(metric).join(' · ')} />
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {areas.length === 3 && (
        <Panel className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold">{t('compare.relativeProfile')}</h2>
          <p className="mb-3 text-sm text-app-text-muted">{t('compare.radarDescription')}</p>
          <div ref={radarRef} className="mx-auto h-80 max-w-2xl">
            <Radar
              aria-label={t('compare.radarChart')}
              role="img"
              data={{
                labels: radarIndicators.map(item => t(item.labelKey)),
                datasets: areas.map((area, areaIndex) => ({
                  label: area.name,
                  data: radarIndicators.map((_, axisIndex) => radarValues[axisIndex][areaIndex]),
                  borderColor: radarColors[areaIndex].line,
                  backgroundColor: radarColors[areaIndex].fill,
                  pointBackgroundColor: radarColors[areaIndex].line,
                  borderWidth: 2,
                })),
              }}
              options={{
                maintainAspectRatio: false,
                animation: { duration: reducedMotion ? 0 : 250 },
                color: chartText,
                font: { family: chartFont },
                scales: {
                  r: {
                    min: 0,
                    max: 100,
                    ticks: { stepSize: 25, color: chartText, backdropColor: 'transparent' },
                    grid: { color: chartGrid },
                    angleLines: { color: chartGrid },
                    pointLabels: { color: chartText, font: { size: 12 } },
                  },
                },
                plugins: {
                  legend: { position: 'bottom', labels: { color: chartText } },
                  tooltip: {
                    backgroundColor: chartSurface,
                    titleColor: chartText,
                    bodyColor: chartText,
                    borderColor: chartGrid,
                    borderWidth: 1,
                    callbacks: {
                      afterLabel: item => tooltipLines(radarMetrics[item.dataIndex][item.datasetIndex]),
                    },
                  },
                },
              }}
            />
          </div>
          <PngExportButton target={() => radarRef.current} filename="so-sanh-radar" />
          <AlternativeTable
            caption={t('compare.radarTable')}
            columns={[t('decision.area'), ...radarIndicators.map(item => t(item.labelKey))]}
            rows={areas.map((area, areaIndex) => [
              area.name,
              ...radarIndicators.map((_, axisIndex) => {
                const value = radarValues[axisIndex][areaIndex]
                const metric = radarMetrics[axisIndex][areaIndex]
                const formatted = value === null ? t('profile.noData') : `${formatValue(value, language)}/100`
                return <MetricTableValue key={`${area.id}-${axisIndex}`} metric={metric} value={formatted} details={tooltipLines(metric).join(' · ')} />
              }),
            ])}
          />
        </Panel>
      )}
      <Panel>
        <h2 className="mb-3 text-lg font-semibold">{t('compare.metricsTitle')}</h2>
        <label className="grid gap-1 text-sm">{t('compare.chartIndicator')}
          <Select value={indicator.code} onChange={event => setCode(event.target.value)}>
            {scalar.map(item => <option key={item.code} value={item.code}>{indicatorLabel(item.code, item.name, t)}</option>)}
          </Select>
        </label>
        <div ref={metricChartRef} className="mt-4 h-64">
          <Bar aria-label={t('compare.metricChart', { indicator: indicatorName })} role="img" data={{
            labels, datasets: [{ label: indicatorName, data: toValues(selected), backgroundColor: chartBrand }],
          }} options={{
            maintainAspectRatio: false,
            animation: { duration: reducedMotion ? 0 : 250 },
            color: chartText,
            font: { family: chartFont },
            scales: {
              x: { grid: { color: chartGrid }, ticks: { color: chartText } },
              y: {
                beginAtZero: true,
                grid: { color: chartGrid },
                ticks: { color: chartText },
                title: { display: true, text: formatUnit(indicator.unit, language), color: chartText },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: chartSurface,
                titleColor: chartText,
                bodyColor: chartText,
                borderColor: chartGrid,
                borderWidth: 1,
                callbacks: { afterLabel: item => tooltipLines(selected[item.dataIndex]) },
              },
            },
          }} />
        </div>
        <PngExportButton target={() => metricChartRef.current} filename={`so-sanh-${indicator.code}`} />
        <AlternativeTable
          caption={t('compare.metricTable', { indicator: indicatorName })}
          columns={[t('decision.area'), indicatorName]}
          rows={areas.map((area, index) => [area.name, metricTableValue(selected[index], true)])}
        />
      </Panel>
      <Panel>
        <h2 className="mb-3 text-lg font-semibold">{t('compare.channelsTitle')}</h2>
        <div ref={channelChartRef} className="h-64">
          <Bar aria-label={t('compare.channelChart')} role="img" data={{
            labels,
            datasets: [
              { label: t('compare.online'), data: toValues(online), backgroundColor: chartBrand },
              { label: t('compare.offline'), data: toValues(offline), backgroundColor: chartNeutral },
            ],
          }} options={{
            maintainAspectRatio: false, indexAxis: 'y', color: chartText, font: { family: chartFont },
            animation: { duration: reducedMotion ? 0 : 250 },
            scales: {
              x: { stacked: true, min: 0, max: 100, grid: { color: chartGrid }, ticks: { color: chartText, callback: value => `${value}%` } },
              y: { stacked: true, grid: { color: chartGrid }, ticks: { color: chartText } },
            },
            plugins: {
              legend: { labels: { color: chartText } },
              tooltip: {
                backgroundColor: chartSurface,
                titleColor: chartText,
                bodyColor: chartText,
                borderColor: chartGrid,
                borderWidth: 1,
                callbacks: { afterLabel: item => tooltipLines((item.datasetIndex === 0 ? online : offline)[item.dataIndex]) },
              },
            },
          }} />
        </div>
        <PngExportButton target={() => channelChartRef.current} filename="co-cau-kenh-mua-sam" />
        <p className="mt-2 text-xs text-app-text-muted">{t('compare.channelDescription')}</p>
        <AlternativeTable
          caption={t('compare.channelTable')}
          columns={[t('decision.area'), t('compare.online'), t('compare.offline')]}
          rows={areas.map((area, index) => [
            area.name,
            metricTableValue(online[index], true),
            metricTableValue(offline[index], true),
          ])}
        />
      </Panel>
    </div>
  )
}
