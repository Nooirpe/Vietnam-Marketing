import { Bar } from 'react-chartjs-2'
import {
  BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip as ChartTooltip,
} from 'chart.js'
import type { CandidateResult } from '../../domain/scoreCandidates'
import { formatValue } from '../map/mapLayers'
import { Panel } from '../ui/Panel'
import { useReducedMotion } from '../ui/useReducedMotion'
import { useT } from '../../locales/useT'
import { indicatorLabel } from '../../locales/translate'

ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, Legend)

const colors = ['#0f766e', '#6d28d9', '#b45309', '#0369a1', '#be123c', '#475569']

export function ContributionChart({ rows }: { rows: CandidateResult[] }) {
  const { language, t } = useT()
  const reducedMotion = useReducedMotion()
  const ranked = rows.filter((row) => row.score !== null && row.status === 'ranked')
  const criteria = rows[0]?.breakdown ?? []
  const chartText = getComputedStyle(document.documentElement).getPropertyValue('--app-chart-text').trim() || '#334155'
  const chartGrid = getComputedStyle(document.documentElement).getPropertyValue('--app-chart-grid').trim() || '#cbd5e1'
  const tableRows = ranked.map((row) => [
    row.area.name,
    ...criteria.map(({ criterion }) => row.breakdown.find((item) => item.criterion.code === criterion.code)?.contribution ?? null),
    row.score,
  ])

  return (
    <Panel>
      <h2 className="mb-1 text-lg font-semibold">{t('decision.contributionTitle')}</h2>
      <p className="mb-3 text-sm text-app-text-muted">{t('decision.contributionDescription')}</p>
      {ranked.length === 0 ? <p className="text-sm text-app-text-muted">{t('decision.contributionUnavailable')}</p> : (
        <>
          <div className="h-72">
            <Bar
              aria-label={t('decision.contributionChart')}
              role="img"
              data={{
                labels: ranked.map((row) => row.area.name),
                datasets: criteria.map(({ criterion, name }, index) => ({
                  label: indicatorLabel(criterion.code, name, t),
                  data: ranked.map((row) => row.breakdown.find((item) => item.criterion.code === criterion.code)?.contribution ?? 0),
                  backgroundColor: colors[index % colors.length],
                  stack: 'score',
                })),
              }}
              options={{
                indexAxis: 'y',
                maintainAspectRatio: false,
                animation: { duration: reducedMotion ? 0 : 200 },
                color: chartText,
                scales: {
                  x: { stacked: true, min: 0, max: 100, grid: { color: chartGrid }, ticks: { color: chartText } },
                  y: { stacked: true, grid: { color: chartGrid }, ticks: { color: chartText } },
                },
                plugins: {
                  legend: { position: 'bottom', labels: { color: chartText } },
                  tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${formatValue(Number(item.raw), language)}` } },
                },
              }}
            />
          </div>
          <table className="sr-only">
            <caption>{t('decision.contributionTable')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('decision.area')}</th>
                {criteria.map((item) => <th key={item.criterion.code} scope="col">
                  {indicatorLabel(item.criterion.code, item.name, t)}
                </th>)}
                <th scope="col">{t('decision.totalScore')}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index) => (
                <tr key={ranked[index].area.id}>
                  {row.map((value, cellIndex) => cellIndex === 0
                    ? <th key={cellIndex} scope="row">{value}</th>
                    : <td key={cellIndex}>{value === null ? t('decision.noValue') : formatValue(Number(value), language)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  )
}
