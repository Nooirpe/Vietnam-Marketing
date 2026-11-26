import type { ResolvedMetric } from '../../domain/resolveMetric'
import type { Snapshot } from '../../types/snapshot'

import { formatMetricUnit, formatNumber, metricStatus } from '../../utils/formatMetric'

export function MetricCell({ metric, snapshot, withUnit = true }: {
  metric: ResolvedMetric
  snapshot: Snapshot
  withUnit?: boolean
}) {
  const { value, unit, reason, status, period, sourceId } = metric
  const source = sourceId ? snapshot.manifest.sources[sourceId] : undefined
  return (
    <div>
      <div className={value === null ? 'font-medium text-slate-600' : 'font-semibold text-slate-900'}>
        {value === null ? 'Chưa có dữ liệu' : (
          <>{typeof value === 'number' ? formatNumber(value) : `${formatNumber(value.low)}–${formatNumber(value.high)}`}
            {withUnit && ` ${formatMetricUnit(unit)}`}</>
        )}
      </div>
      <div className="mt-1 text-xs text-slate-600">Kỳ {period || '—'} · {metricStatus[status]}</div>
      <details className="mt-1 text-xs text-slate-600">
        <summary className="cursor-pointer text-teal-800">{source?.label ?? 'Chưa có nguồn'}</summary>
        {source && <p className="mt-1 break-words">{source.locator}</p>}
        {reason && <p className="mt-1">{reason}</p>}
        {!source && !reason && <p className="mt-1">Chưa có thông tin nguồn.</p>}
      </details>
      {reason && <p className="mt-1 text-xs text-slate-600">{reason}</p>}
    </div>
  )
}
