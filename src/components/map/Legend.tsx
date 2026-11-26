import { formatBin, formatUnit, type LegendBin } from './mapLayers'

interface LegendProps {
  label: string
  unit: string | null
  bins: readonly LegendBin[]
  hasMissing: boolean
  hasExcluded: boolean
  enabled: boolean
}

export function Legend({ label, unit, bins, hasMissing, hasExcluded, enabled }: LegendProps) {
  return (
    <section aria-label="Chú giải bản đồ" className="border-t border-slate-200 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <h3 className="font-semibold text-slate-900">{label}</h3>
        {unit && <span className="text-slate-600">{formatUnit(unit)}</span>}
        {bins.length > 1 && <span className="text-slate-600">Giá trị tăng từ nhạt đến đậm</span>}
      </div>
      {enabled && bins.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">Chưa có số liệu cho phạm vi này.</p>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-800">
        {bins.map((bin) => (
          <li key={bin.lower} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-4 rounded-xs" style={{ background: bin.color }} />
            {formatBin(bin)}
          </li>
        ))}
        {hasMissing && (
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="vmi-missing-key h-3 w-4 rounded-xs" />
            Thiếu dữ liệu
          </li>
        )}
        {hasExcluded && (
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-4 rounded-xs border border-dashed border-slate-500" />
            Ngoài kết quả lọc
          </li>
        )}
      </ul>
    </section>
  )
}
