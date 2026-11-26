import { Link, useLocation } from 'react-router-dom'
import { AreaSelect, ContextControls, actionClass, panelClass } from '../components/common/AnalysisControls'
import { useAnalysisContext } from '../components/common/useAnalysisContext'
import { ComparisonCharts } from '../components/profile/ComparisonCharts'
import { MetricCell } from '../components/profile/MetricCell'
import { formatMetricUnit } from '../utils/formatMetric'
import { SurveySummary } from '../components/profile/SurveySummary'
import { resolveMetric } from '../domain/resolveMetric'
import type { GeoUnit, Snapshot } from '../types/snapshot'

export function CompareMarkets({ snapshot }: { snapshot: Snapshot }) {
  const state = useAnalysisContext(snapshot)
  const { search } = useLocation()
  const areas = state.ids.map((id) => snapshot.unitsById.get(id))
  const valid = state.ids.length >= 2 && state.ids.length <= 3 && new Set(state.ids).size === state.ids.length &&
    areas.every((area) => area && area.level !== 'country' && area.level === areas[0]?.level)
  const periodValid = Object.hasOwn(snapshot.manifest.periods, state.context.period)
  const comparable = valid ? areas as GeoUnit[] : []
  function select(index: number, id: string) {
    const next = [...state.ids]
    if (id) next[index] = id
    else next.splice(index, 1)
    state.setIds(next)
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      <Link className="text-teal-800 underline" to={{ pathname: '/map', search }}>Quay về bản đồ</Link>
      <header>
        <h1 className="text-3xl font-semibold">So sánh địa bàn</h1>
        <p className="mt-2 text-sm text-slate-600">Ghim 2–3 địa bàn cùng cấp và dùng chung kỳ đo, phân khúc, bảng hỏi.
          {snapshot.manifest.isDemo && ' · Dữ liệu mô phỏng'}</p>
      </header>
      <ContextControls state={state} />
      <section className={panelClass}>
        <h2 className="mb-3 text-lg font-semibold">Địa bàn được ghim</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: state.ids.length >= 2 ? 3 : 2 }, (_, index) => (
            <div key={index}>
              <AreaSelect snapshot={snapshot} label={`Địa bàn ${index + 1}`} value={state.ids[index] ?? ''}
                disabledIds={state.ids.filter((_, position) => position !== index)} onChange={(id) => select(index, id)} />
              {state.ids[index] && (
                <button className="mt-2 text-sm text-teal-800 underline" onClick={() => select(index, '')}>Xóa địa bàn {index + 1}</button>
              )}
            </div>
          ))}
        </div>
        {state.ids.length >= 3 && <p className="mt-3 text-sm text-slate-600">Tối đa 3 địa bàn. Hãy thay hoặc xóa một địa bàn để chọn địa bàn khác.</p>}
        {state.ids.length > 3 && <button className="mt-2 text-sm text-teal-800 underline" onClick={() => state.setIds(state.ids.slice(0, 3))}>
          Giữ ba địa bàn đầu tiên
        </button>}
      </section>
      {!valid && <p role="status">Chọn 2–3 địa bàn khác nhau cùng cấp để so sánh.</p>}
      {!periodValid && <p role="alert">Kỳ đo không có trong bộ dữ liệu. Chọn kỳ khác để tra cứu.</p>}
      {valid && (
        <>
          <Link className={`inline-block ${actionClass}`} to={{ pathname: '/decision', search }}>Chấm điểm các địa bàn này</Link>
          <ComparisonCharts snapshot={snapshot} areas={comparable} context={state.context} />
          <section className={panelClass}>
            <h2 className="mb-3 text-lg font-semibold">Bảng so sánh chỉ tiêu</h2>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng so sánh có thể cuộn">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead><tr className="bg-slate-100"><th scope="col" className="p-3">Chỉ tiêu</th>
                  {comparable.map((area) => <th scope="col" key={area.id} className="p-3">
                    {area.name}<small className="ml-2 font-normal">{area.code}</small>
                  </th>)}
                </tr></thead>
                {(['market', 'survey'] as const).map((kind) => (
                  <tbody key={kind}>
                    <tr><th colSpan={comparable.length + 1} className="bg-teal-50 p-3">
                      {kind === 'market' ? 'Dữ liệu bối cảnh' : 'Bằng chứng Needs & Wants'}
                    </th></tr>
                    {kind === 'survey' && <tr className="border-b border-slate-200">
                      <th scope="row" className="p-3 align-top">Thông tin khảo sát</th>
                      {comparable.map((area) => <td key={area.id} className="p-3 align-top">
                        <SurveySummary snapshot={snapshot} geoId={area.id} context={state.context} />
                      </td>)}
                    </tr>}
                    {snapshot.indicators.filter((item) => item.kind === kind).map((item) => (
                      <tr key={item.code} className="border-b border-slate-200">
                        <th scope="row" className="p-3 align-top">
                          {item.name}<span className="block text-xs font-normal text-slate-600">{formatMetricUnit(item.unit)}</span>
                        </th>
                        {comparable.map((area) => <td key={area.id} className="p-3 align-top">
                          <MetricCell snapshot={snapshot} metric={resolveMetric(snapshot, area.id, item.code, state.context)} withUnit={false} />
                        </td>)}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
