import type { CandidateResult } from '../../domain/scoreCandidates'
import type { Snapshot } from '../../types/snapshot'
import { formatValue } from '../map/mapLayers'
import { MetricCell } from '../profile/MetricCell'
import { Badge } from '../ui/Badge'
import { Panel } from '../ui/Panel'
import { useT } from '../../locales/useT'
import { indicatorLabel } from '../../locales/translate'

export function ScoreBreakdown({ row, snapshot }: { row: CandidateResult; snapshot: Snapshot }) {
  const { language, t } = useT()
  const showNumber = (value: number | null) => value === null ? '—' : formatValue(value, language)
  const scored = row.breakdown.filter((item) => item.contribution !== null)
  const peak = (field: 'contribution' | 'pointsLost') => {
    const maximum = Math.max(...scored.map((item) => item[field]!))
    return scored.filter((item) => Math.abs(item[field]! - maximum) <= 1e-9)
      .map((item) => indicatorLabel(item.criterion.code, item.name, t)).join(', ')
  }

  return (
    <Panel as="details">
      <summary className="cursor-pointer">
        <strong>{row.area.name}</strong>
        <span className="ml-2 text-sm text-app-text-muted">
          {row.rank !== null && row.score !== null ? t('decision.rank', { rank: row.rank, score: formatValue(row.score, language) }) :
            row.status === 'ineligible'
              ? row.constraintResults?.some(result => !result.passed) ? t('decision.ineligibleConstraint') : t('decision.ineligibleData')
              : t('decision.unranked')}
        </span>
      </summary>
      {row.reasons.length > 0 && <ul className="my-3 list-disc pl-5 text-sm text-amber-950">
        {row.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>}
      {scored.length > 0 && <div className="my-3 space-y-1 text-sm">
        <p><strong>{t('decision.topContribution')}</strong> · {peak('contribution')}</p>
        <p><strong>{t('decision.topPointsLost')}</strong> · {peak('pointsLost')}</p>
      </div>}
      {row.constraintResults && row.constraintResults.length > 0 && (
        <div className="my-3 space-y-2">
          <h3 className="font-semibold">{t('decision.constraintResults')}</h3>
          <ul className="space-y-2 text-sm">
            {row.constraintResults.map(({ constraint, name, metric, passed, reason }) => (
              <li key={constraint.code} className="flex flex-wrap items-center gap-2">
                <span>{name} {constraint.operator === 'gte' ? '≥' : '≤'} {formatValue(constraint.threshold, language)}:</span>
                <MetricCell snapshot={snapshot} metric={metric} />
                <Badge variant={passed ? 'verified' : 'missing'}>{passed ? t('decision.pass') : t('decision.fail')}</Badge>
                {reason && <span className="text-app-text-muted">{reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={t('decision.explanation', { area: row.area.name })}>
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-100">
            <tr>{[
              t('decision.criterionDirection'), t('decision.rawValue'), t('decision.minMax'),
              t('decision.normalized'), t('decision.weight'), t('decision.contribution'),
            ].map(
              (label) => <th scope="col" key={label} className="p-2">{label}</th>,
            )}</tr>
          </thead>
          <tbody>{row.breakdown.map((item) => (
            <tr key={item.criterion.code} className="border-b border-slate-200">
              <th scope="row" className="p-2 align-top">
                {indicatorLabel(item.criterion.code, item.name, t)}<span className="block font-normal text-app-text-muted">{t(item.criterion.direction === 'benefit' ? 'decision.benefit' : 'decision.cost')}</span>
              </th>
              <td className="p-2 align-top">
                <MetricCell snapshot={snapshot} metric={item.metric} />
                {item.metric.n !== null && <p className="text-xs">n = {item.metric.n} · {item.metric.method}</p>}
              </td>
              <td className="p-2 align-top">
                {item.min === null ? '—' : `${showNumber(item.min)}–${showNumber(item.max)}`}
                {item.min !== null && item.min === item.max && (
                  <span className="block text-xs text-app-text-muted">{t('decision.equalRange')}</span>
                )}
              </td>
              <td className="p-2 align-top">{showNumber(item.normalized)}</td>
              <td className="p-2 align-top">{item.criterion.weight}%</td>
              <td className="p-2 align-top">{showNumber(item.contribution)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  )
}
