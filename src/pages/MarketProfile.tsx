import { Link, useLocation, useParams } from 'react-router-dom'
import { actionClass, ContextControls, panelClass } from '../components/common/AnalysisControls'
import { useAnalysisContext } from '../components/common/useAnalysisContext'
import { MetricCell } from '../components/profile/MetricCell'
import { SurveySummary } from '../components/profile/SurveySummary'
import { resolveMetric } from '../domain/resolveMetric'
import type { Snapshot } from '../types/snapshot'

export function MarketProfile({ snapshot }: { snapshot: Snapshot }) {
  const { geoId } = useParams()
  const { search } = useLocation()
  const state = useAnalysisContext(snapshot)
  const area = geoId ? snapshot.unitsById.get(geoId) : undefined
  const analysisParams = new URLSearchParams(search)
  if (area && area.level !== 'country') {
    const selected = state.ids.filter((id) => snapshot.unitsById.get(id)?.level === area.level && id !== area.id)
    analysisParams.set('areas', [area.id, ...new Set(selected)].slice(0, 3).join(','))
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
      <Link className="text-teal-800 underline" to={{ pathname: '/map', search }}>Quay về bản đồ</Link>
      <header>
        <h1 className="text-3xl font-semibold">{area?.name ?? 'Không tìm thấy địa bàn'}</h1>
        {area && <p className="mt-2 text-sm text-slate-600">Mã {area.code}{snapshot.manifest.isDemo && ' · Dữ liệu mô phỏng'}</p>}
      </header>
      {area && (
        <>
          <div className="flex flex-wrap gap-2">
            <Link className={actionClass} to={{ pathname: '/compare', search: analysisParams.toString() }}>So sánh địa bàn</Link>
            <Link className={actionClass} to={{ pathname: '/decision', search: analysisParams.toString() }}>Chấm điểm địa bàn</Link>
          </div>
          <ContextControls state={state} />
          {!Object.hasOwn(snapshot.manifest.periods, state.context.period) && <p role="alert">Kỳ đo không có trong bộ dữ liệu. Hãy chọn kỳ khác.</p>}
          {(['market', 'survey'] as const).map((kind) => (
            <section className={panelClass} key={kind}>
              <h2 className="mb-4 text-xl font-semibold">{kind === 'market' ? 'Dữ liệu bối cảnh' : 'Bằng chứng Needs & Wants'}</h2>
              {kind === 'survey' && <SurveySummary snapshot={snapshot} geoId={area.id} context={state.context} />}
              <dl className="mt-3 divide-y divide-slate-200">
                {snapshot.indicators.filter((item) => item.kind === kind).map((indicator) => (
                  <div key={indicator.code} className="grid gap-1 py-3 sm:grid-cols-2">
                    <dt className="font-medium">{indicator.name}</dt>
                    <dd><MetricCell snapshot={snapshot} metric={resolveMetric(snapshot, area.id, indicator.code, state.context)} /></dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </>
      )}
    </main>
  )
}
