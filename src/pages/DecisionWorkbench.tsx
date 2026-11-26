import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AreaSelect, ContextControls, actionClass, inputClass, panelClass } from '../components/common/AnalysisControls'
import { useAnalysisContext } from '../components/common/useAnalysisContext'
import { ScoreBreakdown } from '../components/decision/ScoreBreakdown'
import { defaultCriteria, directionText, preset, scoreCandidates, type Criterion, type ScoreResult } from '../domain/scoreCandidates'
import { isScalarIndicator } from '../domain/filterAreas'
import type { Snapshot } from '../types/snapshot'
import { createReport, downloadReport, reportToCsv } from '../utils/exportReport'

export function DecisionWorkbench({ snapshot }: { snapshot: Snapshot }) {
  const state = useAnalysisContext(snapshot)
  const { search } = useLocation()
  const [criteria, setCriteria] = useState(defaultCriteria)
  const [nextCode, setNextCode] = useState('')
  const [calculation, setCalculation] = useState<ScoreResult | null>(null)
  const scenario = JSON.stringify([state.ids, state.context, snapshot.manifest.datasetVersion])
  const [previousScenario, setPreviousScenario] = useState(scenario)
  if (scenario !== previousScenario) {
    setPreviousScenario(scenario)
    setCalculation(null)
  }

  const areas = state.ids.map((id) => snapshot.unitsById.get(id))
  const validAreas = state.ids.length >= 2 && new Set(state.ids).size === state.ids.length &&
    areas.every((area) => area && area.level !== 'country' && area.level === areas[0]?.level)
  const validPeriod = Object.hasOwn(snapshot.manifest.periods, state.context.period)
  const total = criteria.reduce((sum, { weight }) => sum + weight, 0)
  const validWeights = total === 100 && criteria.every(({ weight }) => Number.isInteger(weight) && weight >= 0 && weight <= 100)
  const canCalculate = validAreas && validPeriod && validWeights
  const canExport = canCalculate && calculation?.message === null
  const optional = snapshot.indicators.filter((item) => isScalarIndicator(item) && !criteria.some(({ code }) => code === item.code))

  function select(index: number, id: string) {
    const next = [...state.ids]
    if (id) next[index] = id
    else next.splice(index, 1)
    state.setIds(next)
  }

  function editCriteria(items: Criterion[]) {
    setCriteria(items)
    setCalculation(null)
  }

  function edit(index: number, update: Partial<Criterion>) {
    editCriteria(criteria.map((criterion, position) => position === index ? { ...criterion, ...update } : criterion))
  }

  function exportFile(format: 'csv' | 'json') {
    if (!canExport || !calculation) return
    const report = createReport(snapshot, state.context, criteria, state.ids, calculation)
    const csv = format === 'csv'
    downloadReport(`xep-hang-dia-ban.${format}`, csv ? reportToCsv(report) : JSON.stringify(report, null, 2) + '\n',
      csv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8')
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <nav className="flex flex-wrap gap-4 text-teal-800 underline" aria-label="Điều hướng phân tích">
        <Link to={{ pathname: '/map', search }}>Quay về bản đồ</Link>
        <Link to={{ pathname: '/compare', search }}>So sánh địa bàn</Link>
      </nav>
      <header>
        <h1 className="text-3xl font-semibold">Chấm điểm địa bàn</h1>
        <p className="mt-2 text-sm text-slate-600">{preset} · Ngành tạp hóa{snapshot.manifest.isDemo && ' · Dữ liệu mô phỏng'}</p>
      </header>
      <ContextControls state={state} />
      {!validPeriod && <p role="alert">Kỳ đo không có trong bộ dữ liệu. Chọn kỳ khác để chấm điểm.</p>}

      <section className={panelClass}>
        <h2 className="mb-3 text-lg font-semibold">Địa bàn ứng viên</h2>
        <p className="mb-3 text-sm text-slate-600">Chọn ít nhất hai địa bàn khác nhau cùng cấp.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: Math.max(2, state.ids.length + 1) }, (_, index) => (
            <div key={index}>
              <AreaSelect snapshot={snapshot} label={`Ứng viên ${index + 1}`} value={state.ids[index] ?? ''}
                disabledIds={state.ids.filter((_, position) => position !== index)} onChange={(id) => select(index, id)} />
              {state.ids[index] && <button className="mt-1 text-sm text-teal-800 underline" onClick={() => select(index, '')}>Xóa ứng viên {index + 1}</button>}
            </div>
          ))}
        </div>
        {areas.length >= 2 && !validAreas && <p role="alert" className="mt-3 text-sm text-amber-950">Hãy đổi ứng viên để các địa bàn đều hợp lệ và cùng cấp.</p>}
      </section>

      <section className={panelClass}>
        <h2 className="mb-2 text-lg font-semibold">Tiêu chí và trọng số</h2>
        <p className="mb-3 text-sm text-slate-600">Chiều tác động là giả định của kịch bản khảo sát. Thay đổi ứng viên có thể làm thay đổi thang điểm.</p>
        <div className="divide-y divide-slate-200">
          {criteria.map((criterion, index) => {
            const name = snapshot.indicatorsByCode.get(criterion.code)?.name ?? criterion.code
            return (
              <div key={criterion.code} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6rem] sm:items-center">
                <div>
                  <p className="font-medium">{name}</p>
                  {criterion.required ? <p className="text-sm text-slate-600">{directionText[criterion.direction]} · Bắt buộc</p> : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select aria-label={`Chiều tác động ${criterion.code}`} value={criterion.direction}
                        className="rounded border border-slate-300 p-2 text-sm"
                        onChange={(event) => edit(index, { direction: event.target.value === 'cost' ? 'cost' : 'benefit' })}>
                        <option value="benefit">{directionText.benefit}</option>
                        <option value="cost">{directionText.cost}</option>
                      </select>
                      <button className="text-sm text-teal-800 underline"
                        onClick={() => editCriteria(criteria.filter((item) => item.code !== criterion.code))}>Xóa tiêu chí</button>
                    </div>
                  )}
                </div>
                <input type="range" min="0" max="100" step="1" aria-label={`Thanh trượt ${criterion.code}`}
                  value={Number.isFinite(criterion.weight) ? criterion.weight : 0}
                  onChange={(event) => edit(index, { weight: event.target.valueAsNumber })} className="w-full accent-teal-800" />
                <label className="text-sm">Trọng số %
                  <input type="number" min="0" max="100" step="1" inputMode="numeric"
                    aria-label={`Trọng số ${criterion.code}`} className={inputClass}
                    value={Number.isFinite(criterion.weight) ? criterion.weight : ''}
                    onChange={(event) => edit(index, { weight: event.target.valueAsNumber })} />
                </label>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-52 flex-1 text-sm">Chỉ tiêu bổ sung
            <select className={inputClass} value={nextCode} onChange={(event) => setNextCode(event.target.value)}>
              <option value="">Chọn chỉ tiêu</option>
              {optional.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <button className={actionClass} disabled={!nextCode} onClick={() => {
            editCriteria([...criteria, { code: nextCode, direction: 'benefit', weight: 0, required: false }])
            setNextCode('')
          }}>Thêm tiêu chí</button>
        </div>
        <p className="mt-4 text-sm font-medium" role="status">
          {Number.isFinite(total) ? `Tổng trọng số ${total}%` : 'Nhập trọng số hợp lệ'}
          {Number.isFinite(total) && total !== 100 && ` · ${total < 100 ? 'Còn thiếu' : 'Đang thừa'} ${Math.abs(100 - total)}%`}
          {!validWeights && ' · Mỗi trọng số cần là số nguyên từ 0 đến 100.'}
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button className={actionClass} disabled={!canCalculate} onClick={() => {
          setCalculation(scoreCandidates(snapshot, state.ids, criteria, state.context))
        }}>Tính điểm</button>
        <button className={actionClass} disabled={!canExport} onClick={() => exportFile('csv')}>Tải CSV</button>
        <button className={actionClass} disabled={!canExport} onClick={() => exportFile('json')}>Tải JSON</button>
      </div>
      <p className="text-xs text-slate-600">Khi nhập CSV vào bảng tính, chọn UTF-8 và đặt cột adminCode ở kiểu văn bản để giữ số 0 đầu.</p>
      <section className="space-y-3" aria-label="Kết quả xếp hạng">
        <h2 className="text-lg font-semibold">Kết quả xếp hạng</h2>
        {!calculation && <p className="text-sm text-slate-600">Nhấn Tính điểm để cập nhật kết quả theo cấu hình đang chọn.</p>}
        {calculation?.message && <p role="alert" className="rounded bg-amber-50 p-3">{calculation.message}</p>}
        {calculation?.rows.map((row) => <ScoreBreakdown key={row.area.id} row={row} snapshot={snapshot} />)}
      </section>
    </main>
  )
}
