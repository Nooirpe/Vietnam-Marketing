import type { createReport } from '../../utils/exportReport'
import { formatValue } from '../map/mapLayers'
import { useT } from '../../locales/useT'

type Report = ReturnType<typeof createReport>

export function PrintScoreReport({ report, mapImage, chartImage, layerLabel }: {
  report: Report
  mapImage: string
  chartImage: string
  layerLabel: string
}) {
  const { language, t } = useT()
  const statusLabel = (status: Report['rows'][number]['status']) =>
    t(status === 'ranked' ? 'decision.ranked' : status === 'ineligible' ? 'decision.ineligibleData' : 'decision.unranked')
  const usedSourceIds = new Set(report.rows.flatMap((row) => [
    ...row.breakdown.map((item) => item.metric.sourceId),
    ...(row.constraintResults ?? []).map((item) => item.metric.sourceId),
  ].filter((sourceId): sourceId is string => sourceId !== null)))
  const sources = [...usedSourceIds]
    .map((sourceId) => [sourceId, report.sources[sourceId]] as const)
    .filter((entry) => entry[1] !== undefined)

  return (
    <article id="decision-print-report" className="print-only">
      <header className="print-report-header">
        <h1>{t('decision.reportTitle')}</h1>
        <p>{t('decision.reportDate', { date: new Date(report.exportedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN') })}</p>
        <p>{t('decision.reportContext', {
          period: report.context.period,
          segment: report.context.segment || '—',
          study: report.context.study || '—',
        })}</p>
        <p>{report.sectorName} · {report.algorithmVersion} · {t('decision.reportNormalization', {
          scope: report.normalizationScope ?? t('decision.candidates'),
        })} · {report.preset}</p>
        {report.isDemo && <strong className="print-demo-warning">{t('decision.reportDemo')}</strong>}
      </header>

      <section>
        <h2>{t('decision.reportRanking')}</h2>
        <table className="print-ranking-table">
          <thead><tr>
            <th>{t('decision.reportRank')}</th><th>{t('decision.reportCode')}</th><th>{t('decision.area')}</th><th>{t('decision.reportScore')}</th><th>{t('decision.reportStatusReason')}</th>
          </tr></thead>
          <tbody>{report.rows.map((row) => (
            <tr key={row.area.id}>
              <td>{row.rank ?? '—'}</td>
              <td>{row.area.code}</td>
              <td>{row.area.name}</td>
              <td>{row.score === null ? '—' : `${formatValue(row.score, language)}/100`}</td>
              <td>{row.reasons.length ? row.reasons.join('; ') : statusLabel(row.status)}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <div className="print-report-grid">
        <section>
          <h2>{t('decision.reportContributions')}</h2>
          <img className="print-report-chart" src={chartImage} alt={t('decision.reportChartAlt')} />
        </section>
        <section>
          <h2>{t('decision.reportMap', { layer: layerLabel, period: report.context.period })}</h2>
          <img className="print-report-map" src={mapImage} alt={t('decision.reportMapAlt', { layer: layerLabel, period: report.context.period })} />
        </section>
      </div>

      <section className="print-report-sources">
        <h2>{t('decision.reportSources')}</h2>
        {sources.length > 0 ? (
          <ul>{sources.map(([sourceId, source]) => (
            <li key={sourceId}><strong>{source.label}</strong> · {source.locator}</li>
          ))}</ul>
        ) : <p>{t('decision.reportNoSources')}</p>}
      </section>
      <footer>{t('decision.reportFooter')}</footer>
    </article>
  )
}
