import { Plus, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Indicator } from '../../types/snapshot'
import { validThreshold } from '../../domain/filterAreas'
import type { FilterOperator, FilterPredicate } from '../../domain/filterAreas'

const operators: [FilterOperator, string][] = [
  ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['eq', '='],
]

const units: Record<string, string> = {
  percent: '%',
  person: 'người',
  'person/km2': 'người/km²',
  'store/km2': 'điểm bán/km²',
  'VND/quarter': 'VND/quý',
  'VND/person/month': 'VND/người/tháng',
}

interface DraftPredicate extends Omit<FilterPredicate, 'threshold'> {
  id: number
  threshold: string
}

function toThreshold(text: string): number {
  const trimmed = text.trim()
  return /^\d+(?:[.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : NaN
}

export function PredicateEditor({ indicators, predicates, onApply }: {
  indicators: readonly Indicator[]
  predicates: readonly FilterPredicate[]
  onApply: (predicates: FilterPredicate[]) => void
}) {
  const [drafts, setDrafts] = useState<DraftPredicate[]>(() => predicates.map((predicate, id) => ({
    ...predicate,
    id,
    threshold: String(predicate.threshold),
  })))
  const nextId = useRef(predicates.length)
  const idPrefix = useId()
  const [errors, setErrors] = useState<Record<number, string>>({})
  const labels = new Map(indicators.map(indicator => [indicator.code, indicator]))

  function addPredicate() {
    const code = indicators[0]?.code
    if (!code) return
    const id = nextId.current++
    setDrafts([...drafts, { id, code, operator: 'gt', threshold: '' }])
  }

  function updatePredicate(id: number, update: Partial<Omit<DraftPredicate, 'id'>>) {
    setDrafts(drafts.map(draft => draft.id === id ? { ...draft, ...update } : draft))
    if (errors[id]) setErrors({ ...errors, [id]: '' })
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed: FilterPredicate[] = []
    const invalid: Record<number, string> = {}
    for (const { id, code, operator, threshold: text } of drafts) {
      const indicator = labels.get(code)
      const threshold = toThreshold(text)
      if (!indicator || !validThreshold(indicator, threshold)) {
        invalid[id] = indicator?.unit === 'percent'
          ? 'Nhập tỷ lệ từ 0 đến 100.'
          : indicator?.code === 'population' ? 'Nhập số nguyên không âm.' : 'Nhập số không âm, không dùng dấu nhóm hàng nghìn.'
      } else {
        parsed.push({ code, operator, threshold })
      }
    }
    setErrors(invalid)
    if (Object.keys(invalid).length === 0) onApply(parsed)
  }

  const control = 'min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900'

  return (
    <form noValidate onSubmit={apply} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Điều kiện lọc</h3>
        <button
          type="button"
          onClick={addPredicate}
          disabled={indicators.length === 0}
          className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
        >
          <Plus aria-hidden size={16} /> Thêm điều kiện
        </button>
      </div>

      {drafts.map(({ id, code, operator, threshold }, index) => {
        const indicator = labels.get(code)
        const errorId = `${idPrefix}-predicate-error-${id}`
        return (
          <div key={id} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center gap-1">
              <select
                aria-label={`Chỉ tiêu ${index + 1}`}
                className={`${control} flex-1`}
                value={code}
                onChange={event => updatePredicate(id, { code: event.currentTarget.value })}
              >
                {indicators.map(item => <option value={item.code} key={item.code}>{item.name}</option>)}
              </select>
              <button
                type="button"
                aria-label={`Bỏ điều kiện ${index + 1} khỏi bộ lọc đang sửa`}
                className="shrink-0 rounded p-1.5 text-slate-600 hover:bg-slate-200"
                onClick={() => setDrafts(drafts.filter(draft => draft.id !== id))}
              >
                <Trash2 aria-hidden size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label={`Toán tử ${index + 1}`}
                className={control}
                value={operator}
                onChange={event => updatePredicate(id, { operator: event.currentTarget.value as FilterOperator })}
              >
                {operators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input
                type="text"
                inputMode="decimal"
                aria-label={`Ngưỡng ${index + 1}`}
                aria-invalid={!!errors[id]}
                aria-describedby={errors[id] ? errorId : undefined}
                className={`${control} w-full`}
                value={threshold}
                onChange={event => updatePredicate(id, { threshold: event.currentTarget.value })}
              />
              {indicator && <span className="shrink-0 text-xs text-slate-600">{units[indicator.unit] ?? indicator.unit}</span>}
            </div>
            {errors[id] && <p id={errorId} role="alert" className="text-xs text-red-700">{errors[id]}</p>}
          </div>
        )
      })}

      {(drafts.length > 0 || predicates.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-950">
            Áp dụng bộ lọc
          </button>
          {predicates.length > 0 && (
            <button type="button" className="px-2 py-1 text-sm text-slate-700 underline" onClick={() => onApply([])}>
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}
    </form>
  )
}
