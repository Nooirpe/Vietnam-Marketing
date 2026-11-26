import { ChevronRight, Search, X } from 'lucide-react'
import { useState } from 'react'
import type { GeoUnit } from '../../types/snapshot'
import type { ResultStatus, SearchScope } from '../../domain/filterAreas'
import { PredicateEditor } from './PredicateEditor'
import type { AreaSearchModel } from './useAreaSearch'

const categories: [ResultStatus, string][] = [
  ['matched', 'Đạt'],
  ['failed', 'Không đạt'],
  ['missing', 'Thiếu dữ liệu'],
]

const pageSize = 24

function AreaResults({ model, selectedGeoId, onSelectArea, category, visibleCount, onShowMore, onRemovePredicate }: {
  model: AreaSearchModel
  selectedGeoId: string | null | undefined
  onSelectArea: (unit: GeoUnit) => void
  category: ResultStatus
  visibleCount: number
  onShowMore: () => void
  onRemovePredicate: (index: number) => void
}) {
  const visible = model.results.rows.filter(row => row.status === category).slice(0, visibleCount)
  const indicatorLabels = new Map(model.indicators.map(indicator => [indicator.code, indicator.name]))
  return (
    <>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-slate-200 px-3 py-4 text-sm text-slate-600">
          {model.results.rows.length === 0 ? 'Không tìm thấy địa bàn.' : 'Không có địa bàn trong nhóm này.'}
        </p>
      ) : (
        <ul aria-label="Kết quả tìm kiếm" className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {visible.map(({ area, parent, missing }) => (
            <li key={area.id}>
              <button
                type="button"
                aria-current={area.id === selectedGeoId || undefined}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-slate-50 aria-current:bg-teal-50"
                onClick={() => onSelectArea(area)}
              >
                <span>
                  <span className="block font-medium text-slate-900">{area.name}</span>
                  <span className="block text-xs leading-5 text-slate-600">
                    {area.level === 'ward' && parent ? `${parent.name} · ` : ''}Mã {area.code}
                  </span>
                </span>
                <ChevronRight aria-hidden size={16} className="shrink-0 text-slate-500" />
              </button>
              {missing.length > 0 && (
                <ul className="space-y-1 px-3 pb-3 text-xs text-slate-600">
                  {missing.map(index => (
                    <li key={index}>
                      Thiếu {indicatorLabels.get(model.predicates[index].code)}.{' '}
                      <button
                        type="button"
                        className="font-medium text-teal-800 underline underline-offset-2"
                        onClick={() => onRemovePredicate(index)}
                      >
                        Xóa điều kiện {index + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {model.results.counts[category] > visibleCount && (
        <button type="button" className="mt-2 text-sm font-medium text-teal-800 underline" onClick={onShowMore}>
          Xem thêm địa bàn
        </button>
      )}
    </>
  )
}

export function SearchPanel({ model, selectedGeoId, onSelectArea }: {
  model: AreaSearchModel
  selectedGeoId?: string | null
  onSelectArea: (unit: GeoUnit) => void
}) {
  const [category, setCategory] = useState<ResultStatus>('matched')
  const [page, setPage] = useState({ key: '', count: pageSize })
  const predicateKey = JSON.stringify(model.predicates)
  const listKey = JSON.stringify([model.query, model.scope, model.provinceId, category, predicateKey])
  const visibleCount = page.key === listKey ? page.count : pageSize

  return (
    <section aria-labelledby="area-search-title" className="min-w-0 space-y-4">
      <h2 id="area-search-title" className="text-lg font-semibold tracking-tight text-slate-900">Tìm kiếm và lọc</h2>

      <div>
        <label htmlFor="area-search-query" className="block text-sm font-medium text-slate-900">Tìm địa bàn</label>
        <div className="relative mt-1">
          <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-3 text-slate-500" />
          <input
            id="area-search-query"
            type="search"
            value={model.query}
            onChange={event => { model.setQuery(event.currentTarget.value); setCategory('matched') }}
            placeholder="Tên, bí danh hoặc mã hành chính"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 font-normal placeholder:text-slate-500"
          />
          {model.query && (
            <button
              type="button"
              aria-label="Xóa từ khóa"
              onClick={() => { model.setQuery(''); setCategory('matched') }}
              className="absolute right-1.5 top-1.5 rounded p-1 text-slate-600 hover:bg-slate-100"
            >
              <X aria-hidden size={17} />
            </button>
          )}
        </div>
      </div>

      <label className="block text-sm font-medium text-slate-900">
        Phạm vi tìm kiếm
        <select
          value={model.scope}
          onChange={event => { model.setScope(event.currentTarget.value as SearchScope); setCategory('matched') }}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
        >
          <option value="auto">Tự động</option>
          <option value="province">Tỉnh/thành trong cả nước</option>
          <option value="ward">Xã/phường trong cả nước</option>
          {model.provinceId && <option value="local">Xã/phường trong tỉnh đang xem</option>}
        </select>
      </label>

      <PredicateEditor
        key={predicateKey}
        indicators={model.indicators}
        predicates={model.predicates}
        onApply={predicates => {
          model.setPredicates(predicates)
          setCategory('matched')
        }}
      />

      {model.predicates.length > 0 && (
        <p className="text-xs leading-relaxed text-slate-600">
          Phải đạt mọi điều kiện. Nếu một điều kiện xác định được là sai thì địa bàn thuộc nhóm Không đạt.
          Nhóm Thiếu dữ liệu gồm các trường hợp còn lại có giá trị chưa biết.
        </p>
      )}

      <p className="text-sm text-slate-600" role="status">{model.results.rows.length} địa bàn trước khi áp ngưỡng</p>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Nhóm kết quả">
        {categories.map(([status, label]) => (
          <button
            type="button"
            key={status}
            aria-pressed={category === status}
            onClick={() => setCategory(status)}
            className="rounded-lg border border-slate-200 px-1.5 py-2 text-center text-xs text-slate-700 aria-pressed:border-teal-700 aria-pressed:bg-teal-50 aria-pressed:text-teal-950"
          >
            <span className="block font-semibold tabular-nums">{model.results.counts[status]}</span>
            {label}
          </button>
        ))}
      </div>

      <AreaResults
        model={model}
        selectedGeoId={selectedGeoId}
        onSelectArea={onSelectArea}
        category={category}
        visibleCount={visibleCount}
        onShowMore={() => setPage({ key: listKey, count: visibleCount + pageSize })}
        onRemovePredicate={index => {
          model.setPredicates(model.predicates.filter((_, position) => position !== index))
          setCategory('matched')
        }}
      />
    </section>
  )
}
