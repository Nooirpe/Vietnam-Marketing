import { useLocation } from 'react-router-dom'
import { AreaSelect, ContextControls } from '../components/common/AnalysisControls'
import { useAnalysisContext } from '../components/common/useAnalysisContext'
import { ComparisonCharts } from '../components/profile/ComparisonCharts'
import { MetricCell } from '../components/profile/MetricCell'
import { formatUnit } from '../components/map/mapLayers'
import { SurveySummary } from '../components/profile/SurveySummary'
import { resolveMetric } from '../domain/resolveMetric'
import type { GeoUnit, Snapshot } from '../types/snapshot'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { useT } from '../locales/useT'
import { indicatorLabel } from '../locales/translate'

export function CompareMarkets({ snapshot }: { snapshot: Snapshot }) {
  const state = useAnalysisContext(snapshot)
  const { language, t } = useT()
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
      <header>
        <h1 className="text-3xl font-semibold">{t('compare.title')}</h1>
        <p className="mt-2 text-sm text-app-text-muted">{t('compare.help')}
          {snapshot.manifest.isDemo && ` · ${t('app.demo')}`}</p>
      </header>
      <ContextControls state={state} />
      <Panel>
        <h2 className="mb-3 text-lg font-semibold">{t('compare.pinnedAreas')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: state.ids.length >= 2 ? 3 : 2 }, (_, index) => (
            <div key={index}>
              <AreaSelect snapshot={snapshot} label={t('compare.areaLabel', { index: index + 1 })} value={state.ids[index] ?? ''}
                disabledIds={state.ids.filter((_, position) => position !== index)} onChange={(id) => select(index, id)} />
              {state.ids[index] && (
                <Button variant="ghost" className="mt-2 !min-h-0 !p-0 text-sm underline" onClick={() => select(index, '')}>{t('compare.removeAreaAction', { index: index + 1 })}</Button>
              )}
            </div>
          ))}
        </div>
        {state.ids.length >= 3 && <p className="mt-3 text-sm text-app-text-muted">{t('compare.maxThree')}</p>}
        {state.ids.length > 3 && <Button variant="ghost" className="mt-2 !min-h-0 !p-0 text-sm underline" onClick={() => state.setIds(state.ids.slice(0, 3))}>
          {t('compare.keepFirst')}
        </Button>}
      </Panel>
      {!valid && <p role="status">{t('compare.choose')}</p>}
      {!periodValid && <p role="alert">{t('common.noPeriod')}</p>}
      {valid && (
        <>
          <Button as="link" to={{ pathname: '/decision', search }}>{t('compare.scoreThese')}</Button>
          <ComparisonCharts snapshot={snapshot} areas={comparable} context={state.context} />
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">{t('compare.table')}</h2>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('compare.scrollable')}>
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead><tr className="bg-app-surface-muted"><th scope="col" className="p-3">{t('compare.indicator')}</th>
                  {comparable.map((area) => <th scope="col" key={area.id} className="p-3">
                    {area.name}<small className="ml-2 font-normal">{area.code}</small>
                  </th>)}
                </tr></thead>
                {(['market', 'survey'] as const).map((kind) => (
                  <tbody key={kind}>
                    <tr><th colSpan={comparable.length + 1} className="bg-app-surface-muted p-3">
                      {t(kind === 'market' ? 'compare.marketData' : 'compare.surveyData')}
                    </th></tr>
                    {kind === 'survey' && <tr className="border-b border-app-border">
                      <th scope="row" className="p-3 align-top">{t('compare.surveyInfo')}</th>
                      {comparable.map((area) => <td key={area.id} className="p-3 align-top">
                        <SurveySummary snapshot={snapshot} geoId={area.id} context={state.context} />
                      </td>)}
                    </tr>}
                    {snapshot.indicators.filter((item) => item.kind === kind).map((item) => (
                      <tr key={item.code} className="border-b border-app-border">
                        <th scope="row" className="p-3 align-top">
                          {indicatorLabel(item.code, item.name, t)}<span className="block text-xs font-normal text-app-text-muted">{formatUnit(item.unit, language)}</span>
                        </th>
                        {comparable.map((area) => <td key={area.id} className="p-3 align-top">
                          <MetricCell snapshot={snapshot} metric={resolveMetric(snapshot, area.id, item.code, state.context)} withUnit={false} context={state.context} />
                        </td>)}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Panel>
        </>
      )}
    </main>
  )
}
