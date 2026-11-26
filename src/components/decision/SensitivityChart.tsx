import { useRef } from 'react'
import type { CriterionSensitivity, SensitivityScenario } from '../../domain/sensitivity'
import { Badge } from '../ui/Badge'
import { Panel } from '../ui/Panel'
import { PngExportButton } from '../common/PngExportButton'
import { useT } from '../../locales/useT'

function ScenarioBar({ scenario, candidateCount, criterionName }: {
  scenario: SensitivityScenario
  candidateCount: number
  criterionName: string
}) {
  const { t } = useT()
  const changedCount = scenario.rankChanges.length
  const percentage = candidateCount > 0 ? changedCount / candidateCount * 100 : 0
  const sign = scenario.delta > 0 ? '+' : ''
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)_max-content] sm:items-center">
      <span className="text-sm">{t('decision.weightChange', { delta: `${sign}${scenario.delta}` })}</span>
      {scenario.feasible ? (
        <div
          role="img"
          aria-label={t('decision.sensitivityChart', {
            criterion: criterionName, delta: `${sign}${scenario.delta}`, changed: changedCount, total: candidateCount,
          })}
          className="h-4 overflow-hidden rounded-full bg-app-surface-muted"
        >
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ width: `${percentage}%` }}
          />
        </div>
      ) : (
        <p className="text-xs text-app-text-muted">{scenario.reason}</p>
      )}
      <span className="text-xs text-app-text-muted">
        {scenario.feasible ? t('decision.rankChanges', { changed: changedCount, total: candidateCount }) : t('decision.notFeasible')}
      </span>
    </div>
  )
}

export function SensitivityChart({ results, candidateCount }: {
  results: CriterionSensitivity[]
  candidateCount: number
}) {
  const { t } = useT()
  const chartRef = useRef<HTMLDivElement>(null)
  const overallStatus = results.some(result => result.status === 'sensitive')
    ? 'sensitive'
    : results.length > 0 && results.every(result => result.status === 'stable') ? 'stable' : 'unavailable'

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{t('decision.sensitivityTitle')}</h2>
        <Badge variant={overallStatus === 'stable' ? 'verified' : overallStatus === 'sensitive' ? 'estimated' : 'missing'}>
          {t(overallStatus === 'stable' ? 'decision.stable' : overallStatus === 'sensitive' ? 'decision.sensitive' : 'decision.sensitivityUnavailable')}
        </Badge>
      </div>
      <p className="mb-4 text-sm text-app-text-muted">
        {t('decision.sensitivityDescription')}
      </p>
      <div ref={chartRef} className="space-y-4">
        {results.map(result => (
          <section key={result.code} className="space-y-2 border-t border-app-border pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{result.name}</h3>
              <Badge variant={result.status === 'stable' ? 'verified' : result.status === 'sensitive' ? 'estimated' : 'missing'}>
                {t(result.status === 'stable' ? 'decision.stable' : result.status === 'sensitive' ? 'decision.sensitive' : 'decision.sensitivityUnavailable')}
              </Badge>
            </div>
            <PngExportButton target={() => chartRef.current} filename="phan-tich-do-nhay" label={t('decision.exportPng')} />
            {result.scenarios.map(scenario => (
              <ScenarioBar
                key={scenario.delta}
                scenario={scenario}
                candidateCount={candidateCount}
                criterionName={result.name}
              />
            ))}
          </section>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t('decision.sensitivityTable')}</caption>
        <thead>
          <tr><th scope="col">{t('decision.criterion')}</th><th scope="col">{t('decision.status')}</th><th scope="col">{t('decision.weightChangeHeader')}</th><th scope="col">{t('decision.changedRanks')}</th></tr>
        </thead>
        <tbody>
          {results.flatMap(result => result.scenarios.map(scenario => (
            <tr key={`${result.code}-${scenario.delta}`}>
              <th scope="row">{result.name} · {scenario.delta > 0 ? '+' : ''}{scenario.delta}</th>
              <td>{scenario.feasible
                ? t(scenario.rankChanges.length > 0 ? 'decision.sensitive' : 'decision.stable')
                : t('decision.sensitivityUnavailable')}</td>
              <td>{scenario.delta}</td>
              <td>{scenario.feasible ? t('decision.rankChanges', { changed: scenario.rankChanges.length, total: candidateCount }) : t('decision.notFeasible')}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </Panel>
  )
}
