import { dataKey } from '../data/indexes'
import type { MetricContext, Snapshot } from '../types/snapshot'

interface MetricMetadata {
  unit: string | null
  period: string
  sourceId: string | null
  n: number | null
  method: string | null
}

export type ResolvedMetric = MetricMetadata & (
  | { value: number | { low: number; high: number }; status: 'verified' | 'estimated'; reason: null }
  | { value: null; status: 'unavailable'; reason: string }
)

export function resolveMetric(snapshot: Snapshot, geoId: string, code: string, context: MetricContext): ResolvedMetric {
  const { period, segment, study } = context
  const indicator = snapshot.indicatorsByCode.get(code)
  const defaults = { unit: indicator?.unit ?? null, period, sourceId: null, n: null, method: null }
  if (indicator?.kind === 'market') {
    const row = snapshot.observationsByKey.get(dataKey(geoId, period, code))
    const value = row?.values[code]
    if (row && typeof value === 'number' && row.status !== 'unavailable') {
      return { ...defaults, value, sourceId: row.sourceId, status: row.status, reason: null }
    }
    return { ...defaults, value: null, sourceId: row?.sourceId ?? null, status: 'unavailable', reason: row?.missingReasons[code] ?? 'Chưa có bản ghi' }
  }
  if (indicator?.kind === 'survey') {
    const row = snapshot.evidenceByKey.get(dataKey(geoId, period, segment, study))
    if (row?.evidenceState === 'available' && Object.hasOwn(row.answers, code)) {
      const value = row.answers[code as keyof typeof row.answers]
      return { ...defaults, value, sourceId: row.sourceId, status: row.status, reason: null, n: row.n, method: row.method }
    }
    return { ...defaults, value: null, sourceId: row?.sourceId ?? null, status: 'unavailable', reason: row?.evidenceState === 'no_evidence' ? row.reason : 'Không tìm thấy khảo sát khớp' }
  }
  return { ...defaults, value: null, status: 'unavailable', reason: 'Chỉ tiêu chưa khai báo' }
}
