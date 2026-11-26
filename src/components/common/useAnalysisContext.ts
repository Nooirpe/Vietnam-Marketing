import { useSearchParams } from 'react-router-dom'
import type { MetricContext, Snapshot } from '../../types/snapshot'

const labels: Record<string, string> = {
  urban_adults: 'Người trưởng thành ở đô thị',
  grocery_delivery_v1: 'Giao hàng tạp hóa v1',
}

export function surveyLabel(value: string) {
  return labels[value] ?? value
}

export function useAnalysisContext(snapshot: Snapshot) {
  const [params, setParams] = useSearchParams()
  const periods = Object.keys(snapshot.manifest.periods).sort().reverse()
  const segments = [...new Set(snapshot.evidence.map((row) => row.segment))].sort()
  const studies = [...new Set(snapshot.evidence.map((row) => row.study))].sort()
  const context: MetricContext = {
    period: params.get('period') ?? periods[0],
    segment: params.get('segment') ?? segments[0] ?? '',
    study: params.get('study') ?? studies[0] ?? '',
  }
  const ids = (params.get('areas') ?? '').split(',').filter(Boolean)
  function set(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { preventScrollReset: true })
  }
  return { context, periods, segments, studies, ids, set, setIds: (next: string[]) => set('areas', next.join(',')) }
}

export type AnalysisState = ReturnType<typeof useAnalysisContext>
