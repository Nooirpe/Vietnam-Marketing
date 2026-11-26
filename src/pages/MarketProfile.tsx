import { useLocation, useParams } from 'react-router-dom'
import { useWorkspaceState } from '../app/useWorkspaceState'
import { ContextControls } from '../components/common/AnalysisControls'
import { useAnalysisContext } from '../components/common/useAnalysisContext'
import { MetricCell } from '../components/profile/MetricCell'
import { MetricSparkline } from '../components/profile/MetricSparkline'
import { ProfileKpis } from '../components/profile/ProfileKpis'
import { SurveySummary } from '../components/profile/SurveySummary'
import { resolveMetric } from '../domain/resolveMetric'
import type { Snapshot } from '../types/snapshot'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { useT } from '../locales/useT'
import { indicatorLabel } from '../locales/translate'

export function MarketProfile({ snapshot }: { snapshot: Snapshot }) {
  const { geoId } = useParams()
  const { t } = useT()
  const { search } = useLocation()
  const state = useAnalysisContext(snapshot)
  const { isShortlisted, pin, unpin } = useWorkspaceState()
  const area = geoId ? snapshot.unitsById.get(geoId) : undefined
  const analysisParams = new URLSearchParams(search)
  if (area && area.level !== 'country') {
    const selected = state.ids.filter((id) => snapshot.unitsById.get(id)?.level === area.level && id !== area.id)
    analysisParams.set('areas', [area.id, ...new Set(selected)].slice(0, 3).join(','))
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold">{area?.name ?? t('profile.notFound')}</h1>
        {area && <p className="mt-2 text-sm text-app-text-muted">{t('profile.code', { code: area.code })}{snapshot.manifest.isDemo && ` · ${t('app.demo')}`}</p>}
      </header>
      {area && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button as="link" to={{ pathname: '/compare', search: analysisParams.toString() }}>{t('profile.compare')}</Button>
            <Button as="link" to={{ pathname: '/decision', search: analysisParams.toString() }}>{t('profile.score')}</Button>
            <Button type="button" variant={isShortlisted(area.id) ? 'secondary' : 'primary'}
              onClick={() => isShortlisted(area.id) ? unpin(area.id) : pin(area.id)}>
              {isShortlisted(area.id) ? t('profile.unpin') : t('profile.pin')}
            </Button>
          </div>
          <ContextControls state={state} />
          {!Object.hasOwn(snapshot.manifest.periods, state.context.period) && <p role="alert">{t('profile.periodMissing')}</p>}
          <ProfileKpis snapshot={snapshot} geoId={area.id} context={state.context} />
          {(['market', 'survey'] as const).map((kind) => (
            <Panel key={kind}>
              <h2 className="mb-4 text-xl font-semibold">{t(kind === 'market' ? 'profile.marketData' : 'profile.surveyData')}</h2>
              {kind === 'survey' && <SurveySummary snapshot={snapshot} geoId={area.id} context={state.context} />}
              <dl className="mt-3 divide-y divide-slate-200">
                {snapshot.indicators.filter((item) => item.kind === kind).map((indicator) => (
                  <div key={indicator.code} className="grid gap-1 py-3 sm:grid-cols-2">
                    <dt className="font-medium">{indicatorLabel(indicator.code, indicator.name, t)}</dt>
                    <dd>
                      <MetricCell snapshot={snapshot} metric={resolveMetric(snapshot, area.id, indicator.code, state.context)} context={state.context} />
                      <MetricSparkline snapshot={snapshot} geoId={area.id} code={indicator.code} context={state.context} label={indicatorLabel(indicator.code, indicator.name, t)} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ))}
        </>
      )}
    </main>
  )
}
