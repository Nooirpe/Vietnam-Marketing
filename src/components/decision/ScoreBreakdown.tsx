import { directionText, type CandidateResult } from '../../domain/scoreCandidates'
import type { Snapshot } from '../../types/snapshot'
import { formatNumber } from '../../utils/formatMetric'
import { MetricCell } from '../profile/MetricCell'

const showNumber = (value: number | null) => value === null ? '—' : formatNumber(value)

export function ScoreBreakdown({ row, snapshot }: { row: CandidateResult; snapshot: Snapshot }) {
  const scored = row.breakdown.filter((item) => item.contribution !== null)
  const peak = (field: 'contribution' | 'pointsLost') => {
    const maximum = Math.max(...scored.map((item) => item[field]!))
    return scored.filter((item) => Math.abs(item[field]! - maximum) <= 1e-9).map((item) => item.name).join(', ')
  }

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer">
        <strong>{row.area.name}</strong>
        <span className="ml-2 text-sm text-slate-700">
          {row.rank !== null && row.score !== null ? `Hạng ${row.rank} · ${formatNumber(row.score)}/100` :
            row.status === 'ineligible' ? 'Không đủ dữ liệu' : 'Chưa xếp hạng'}
        </span>
      </summary>
      {row.reasons.length > 0 && <ul className="my-3 list-disc pl-5 text-sm text-amber-950">
        {row.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>}
      {scored.length > 0 && <div className="my-3 space-y-1 text-sm">
        <p><strong>Đóng góp lớn nhất</strong> · {peak('contribution')}</p>
        <p><strong>Mất nhiều điểm nhất</strong> · {peak('pointsLost')}</p>
      </div>}
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={`Giải thích điểm ${row.area.name}`}>
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-100">
            <tr>{['Tiêu chí và chiều tác động', 'Giá trị gốc', 'Min–Max', 'Điểm chuẩn hóa', 'Trọng số', 'Đóng góp'].map(
              (label) => <th scope="col" key={label} className="p-2">{label}</th>,
            )}</tr>
          </thead>
          <tbody>{row.breakdown.map((item) => (
            <tr key={item.criterion.code} className="border-b border-slate-200">
              <th scope="row" className="p-2 align-top">
                {item.name}<span className="block font-normal text-slate-600">{directionText[item.criterion.direction]}</span>
              </th>
              <td className="p-2 align-top">
                <MetricCell snapshot={snapshot} metric={item.metric} />
                {item.metric.n !== null && <p className="text-xs">n = {item.metric.n} · {item.metric.method}</p>}
              </td>
              <td className="p-2 align-top">
                {item.min === null ? '—' : `${showNumber(item.min)}–${showNumber(item.max)}`}
                {item.min !== null && item.min === item.max && (
                  <span className="block text-xs text-slate-600">Đồng giá trị, không phân biệt địa bàn</span>
                )}
              </td>
              <td className="p-2 align-top">{showNumber(item.normalized)}</td>
              <td className="p-2 align-top">{item.criterion.weight}%</td>
              <td className="p-2 align-top">{showNumber(item.contribution)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  )
}
