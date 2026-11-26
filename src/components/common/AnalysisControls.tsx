import type { GeoUnit, Snapshot } from '../../types/snapshot'
import { surveyLabel, type AnalysisState } from './useAnalysisContext'

export const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm'
export const panelClass = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5'
export const actionClass = 'rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50'

export function ContextControls({ state }: { state: AnalysisState }) {
  return (
    <fieldset className={`${panelClass} grid gap-3 sm:grid-cols-3`}>
      <legend className="sr-only">Ngữ cảnh chung</legend>
      {([
        ['period', 'Kỳ đo', state.periods],
        ['segment', 'Phân khúc', state.segments],
        ['study', 'Bảng hỏi', state.studies],
      ] as const).map(([key, label, options]) => (
        <label key={key} className="grid gap-1 text-sm font-medium">
          {label}
          <select className={inputClass} value={state.context[key]} onChange={(event) => state.set(key, event.target.value)}>
            {!options.includes(state.context[key]) && (
              <option value={state.context[key]}>{state.context[key] || 'Chưa có lựa chọn'}</option>
            )}
            {options.map((value) => <option key={value} value={value}>{surveyLabel(value)}</option>)}
          </select>
        </label>
      ))}
    </fieldset>
  )
}

function areaName(snapshot: Snapshot, area: GeoUnit) {
  const parent = area.parentId ? snapshot.unitsById.get(area.parentId) : undefined
  return [area.name, area.level === 'ward' ? parent?.name : undefined, area.code].filter(Boolean).join(' · ')
}

export function AreaSelect({ snapshot, value, label, onChange, disabledIds = [] }: {
  snapshot: Snapshot
  value: string
  label: string
  onChange: (value: string) => void
  disabledIds?: string[]
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Chọn địa bàn</option>
        {value && !snapshot.unitsById.has(value) && <option value={value}>Mã không có trong bộ dữ liệu ({value})</option>}
        {(['province', 'ward'] as const).map((level) => (
          <optgroup key={level} label={level === 'province' ? 'Tỉnh và thành phố' : 'Xã và phường'}>
            {snapshot.units.filter((area) => area.level === level).map((area) => (
              <option key={area.id} value={area.id} disabled={disabledIds.includes(area.id)}>{areaName(snapshot, area)}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
