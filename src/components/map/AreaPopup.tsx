import type { ReactNode } from 'react'
import type { resolveMetric } from '../../domain/resolveMetric'
import type { Snapshot } from '../../types/snapshot'
import { findBin, formatBin, formatUnit, formatValue, type LegendBin } from './mapLayers'

type MetricValue = ReturnType<typeof resolveMetric>
type GeoUnit = Snapshot['units'][number]
type Period = Snapshot['manifest']['periods'][string]
type Source = Snapshot['manifest']['sources'][string]

const statusLabels = {
  verified: 'Đã xác minh',
  estimated: 'Ước tính',
  unavailable: 'Chưa có dữ liệu',
}

function formatSurveySegment(segment: string) {
  return segment === 'urban_adults' ? 'Người trưởng thành ở đô thị' : segment
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
  bins,
  onClose,
  action,
}: AreaPopupProps) {
  const bin = typeof metric?.value === 'number' ? findBin(bins, metric.value) : undefined
  const value = typeof metric?.value === 'number' ? formatValue(metric.value) : null

  return (
    <section aria-label="Thông tin địa bàn" className="relative min-w-48 max-w-xs text-sm text-slate-800">
      <button type="button" aria-label="Đóng thông tin địa bàn" onClick={onClose}
        className="absolute top-0 right-0 flex size-6 cursor-pointer items-center justify-center text-xl text-slate-600 hover:text-slate-900">
        ×
      </button>
      <h3 className="pr-8 text-base font-semibold leading-snug">{area.name}</h3>
      <dl className="my-2 space-y-1 break-words">
        <div><dt className="inline font-semibold">Mã hành chính </dt><dd className="inline">{area.code}</dd></div>
        {metric && (
          <>
            <div><dt className="inline font-semibold">{label} </dt>
              <dd className="inline">{value === null ? 'Chưa có dữ liệu' : `${value} ${formatUnit(metric.unit)}`}</dd>
            </div>
            {bin && <div><dt className="inline font-semibold">Khoảng chú giải </dt><dd className="inline">{formatBin(bin)}</dd></div>}
            <div><dt className="inline font-semibold">Kỳ đo </dt>
              <dd className="inline">{metric.period}{period && ` (${period.start} – ${period.end})`}</dd>
            </div>
            <div><dt className="inline font-semibold">Trạng thái </dt><dd className="inline">{statusLabels[metric.status]}</dd></div>
            <div><dt className="inline font-semibold">Nguồn </dt>
              <dd className="inline">{source ? `${source.label} · ${source.locator}` : 'Chưa có nguồn cho phép đo này'}</dd>
            </div>
            {surveySegment && (
              <>
                <div><dt className="inline font-semibold">Phân khúc </dt><dd className="inline">{formatSurveySegment(surveySegment)}</dd></div>
                {metric.n !== null && <div><dt className="inline font-semibold">Cỡ mẫu </dt><dd className="inline">n = {metric.n}</dd></div>}
                {metric.method && <div><dt className="inline font-semibold">Phương pháp </dt><dd className="inline">{metric.method}</dd></div>}
              </>
            )}
            {metric.reason && <div><dt className="inline font-semibold">Lý do </dt><dd className="inline">{metric.reason}</dd></div>}
          </>
        )}
      </dl>
      {isDemo && <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">Dữ liệu mô phỏng</span>}
      {geometryMissing && <div className="mt-2 text-sm text-slate-600">Chưa có ranh giới hiển thị cho địa bàn này.</div>}
      <div className="mt-3">{action}</div>
    </section>
  )
}
