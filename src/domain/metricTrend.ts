import { resolveMetric } from './resolveMetric'
import type { ResolvedMetric } from './resolveMetric'
import type { MetricContext, Snapshot } from '../types/snapshot'

export interface MetricTrendPoint {
  period: string
  value: number | null
  status: ResolvedMetric['status']
}

export function resolveMetricTrend(
  snapshot: Snapshot,
  geoId: string,
  code: string,
  context: MetricContext,
): MetricTrendPoint[] {
  if (code === 'wtp') return []

  return Object.entries(snapshot.manifest.periods)
    .sort(([periodA, datesA], [periodB, datesB]) =>
      datesA.start.localeCompare(datesB.start) || periodA.localeCompare(periodB),
    )
    .map(([period]) => {
      const metric = resolveMetric(snapshot, geoId, code, { ...context, period })
      return {
        period,
        value: typeof metric.value === 'number' ? metric.value : null,
        status: metric.status,
      }
    })
}
