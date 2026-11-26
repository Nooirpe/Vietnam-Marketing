import { dataKey } from '../../data/indexes'
import type { MetricContext, Snapshot } from '../../types/snapshot'
import { surveyLabel } from '../common/useAnalysisContext'
import { Badge } from '../ui/Badge'
import { useT } from '../../locales/useT'

export function SurveySummary({ snapshot, geoId, context }: { snapshot: Snapshot; geoId: string; context: MetricContext }) {
  const { t } = useT()
  const row = snapshot.evidenceByKey.get(dataKey(geoId, context.period, context.segment, context.study))
  const segment = context.segment === 'urban_adults' ? t('common.survey.urban_adults') : surveyLabel(context.segment)
  const study = context.study === 'grocery_delivery_v1' ? t('common.survey.grocery_delivery_v1') : surveyLabel(context.study)
  return (
    <div className="space-y-1 text-sm text-app-text">
      <p>{t('survey.segment', { segment: segment || '—', period: context.period })}</p>
      <p>{t('survey.study', { study: study || '—' })}</p>
      {context.study === 'grocery_delivery_v1' && (
        <p>{t('survey.groceryDescription')}</p>
      )}
      {row?.evidenceState === 'available' ? (
        <>
          <p className="font-semibold">{t('survey.sampleResult', { n: row.n })}</p>
          <p>{t('survey.method', { method: row.method })}</p>
        </>
      ) : (
        <div><Badge variant="missing">{t('survey.missing')}</Badge><p className="mt-1">{row?.reason ?? t('survey.notFound')}</p></div>
      )}
    </div>
  )
}
