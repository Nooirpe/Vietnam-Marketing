import { useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import type { MetricContext, GeoUnit, Snapshot } from '../../types/snapshot'
import { resolveMetric, type ResolvedMetric } from '../../domain/resolveMetric'
import { inputClass, panelClass } from '../common/AnalysisControls'
import { formatMetricUnit, metricStatus } from '../../utils/formatMetric'
import { isScalarIndicator } from '../../domain/filterAreas'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export function ComparisonCharts({ snapshot, areas, context }: { snapshot: Snapshot; areas: GeoUnit[]; context: MetricContext }) {
  const scalar = snapshot.indicators.filter(isScalarIndicator)
  const [code, setCode] = useState('population')
  const indicator = scalar.find((item) => item.code === code) ?? scalar[0]
  if (!indicator) return null

  const labels = areas.map((area) => area.name)
  const metrics = (key: string) => areas.map((area) => resolveMetric(snapshot, area.id, key, context))
  const toValues = (items: ResolvedMetric[]) => items.map(({ value }) => typeof value === 'number' ? value : null)
  const selected = metrics(indicator.code)
  const online = metrics('online')
  const offline = metrics('offline')
  function tooltip(metric: ResolvedMetric) {
    const source = metric.sourceId ? snapshot.manifest.sources[metric.sourceId] : undefined
    return [`Kỳ ${metric.period} · ${metricStatus[metric.status]}`, source?.label ?? 'Chưa có nguồn']
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={panelClass}>
        <h2 className="mb-3 text-lg font-semibold">So sánh chỉ tiêu</h2>
        <label className="grid gap-1 text-sm">Chỉ tiêu biểu đồ
          <select className={inputClass} value={indicator.code} onChange={(event) => setCode(event.target.value)}>
            {scalar.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <div className="mt-4 h-64">
          <Bar aria-label={`Biểu đồ ${indicator.name}`} role="img" data={{
            labels, datasets: [{ label: indicator.name, data: toValues(selected), backgroundColor: '#0f766e' }],
          }} options={{
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: formatMetricUnit(indicator.unit) } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (item) => tooltip(selected[item.dataIndex]) } } },
          }} />
        </div>
      </section>
      <section className={panelClass}>
        <h2 className="mb-3 text-lg font-semibold">Kênh mua sắm ưu tiên</h2>
        <div className="h-64">
          <Bar aria-label="Biểu đồ thanh chồng tỷ lệ ưu tiên mua online và tại cửa hàng" role="img" data={{
            labels,
            datasets: [
              { label: 'Online', data: toValues(online), backgroundColor: '#0f766e' },
              { label: 'Tại cửa hàng', data: toValues(offline), backgroundColor: '#64748b' },
            ],
          }} options={{
            maintainAspectRatio: false, indexAxis: 'y',
            scales: { x: { stacked: true, min: 0, max: 100, ticks: { callback: (value) => `${value}%` } }, y: { stacked: true } },
            plugins: { tooltip: { callbacks: { afterLabel: (item) => tooltip((item.datasetIndex === 0 ? online : offline)[item.dataIndex]) } } },
          }} />
        </div>
        <p className="mt-2 text-xs text-slate-600">Mỗi thanh thể hiện tỷ lệ trong mẫu. Đọc giá trị, nguồn và kỳ đo tại bảng bên dưới.</p>
      </section>
    </div>
  )
}
