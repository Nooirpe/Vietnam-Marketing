import { resolveMetric, type ResolvedMetric } from './resolveMetric'
import type { GeoUnit, MetricContext, Snapshot } from '../types/snapshot'

export const algorithmVersion = 'min-max-v1'
export const preset = 'Ưu tiên khảo sát giao hàng tạp hóa'
export const directionText = { benefit: 'Càng cao càng tốt', cost: 'Càng thấp càng tốt' }

export interface Criterion {
  code: string
  direction: 'benefit' | 'cost'
  weight: number
  required: boolean
}

export const defaultCriteria: Criterion[] = [
  { code: 'unmet', direction: 'benefit', weight: 60, required: true },
  { code: 'poi_density', direction: 'cost', weight: 40, required: true },
]

export interface Breakdown {
  criterion: Criterion
  name: string
  metric: ResolvedMetric
  min: number | null
  max: number | null
  normalized: number | null
  contribution: number | null
  pointsLost: number | null
}

export interface CandidateResult {
  area: GeoUnit
  status: 'ranked' | 'ineligible' | 'unranked'
  score: number | null
  rank: number | null
  reasons: string[]
  breakdown: Breakdown[]
}

export interface ScoreResult {
  rows: CandidateResult[]
  message: string | null
}

export function scoreCandidates(snapshot: Snapshot, ids: readonly string[], criteria: readonly Criterion[], context: MetricContext): ScoreResult {
  const areas = ids.map((id) => snapshot.unitsById.get(id))
  const unique = new Set(ids)
  if (areas.length < 2 || unique.size !== areas.length || areas.some((area) => !area || area.level === 'country' || area.level !== areas[0]?.level)) {
    return { rows: [], message: 'Chọn ít nhất hai địa bàn khác nhau cùng cấp.' }
  }
  if (!Object.hasOwn(snapshot.manifest.periods, context.period)) return { rows: [], message: 'Kỳ đo không có trong bộ dữ liệu.' }
  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0)
  if (criteria.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 100) || total !== 100) {
    return { rows: [], message: 'Tổng trọng số phải bằng 100%.' }
  }
  if (new Set(criteria.map(({ code }) => code)).size !== criteria.length ||
      criteria.some(({ code }) => !snapshot.indicatorsByCode.has(code) || code === 'wtp')) {
    return { rows: [], message: 'Các tiêu chí phải khác nhau và có giá trị số vô hướng.' }
  }

  const rows: CandidateResult[] = (areas as GeoUnit[]).map((area) => {
    const reasons: string[] = []
    const breakdown = criteria.map((criterion): Breakdown => {
      const metric = resolveMetric(snapshot, area.id, criterion.code, context)
      const name = snapshot.indicatorsByCode.get(criterion.code)!.name
      if ((criterion.required || criterion.weight > 0) && typeof metric.value !== 'number') {
        reasons.push(`${name} · ${metric.reason ?? 'Giá trị không phải số vô hướng'}`)
      }
      return { criterion: { ...criterion }, name, metric, min: null, max: null, normalized: null, contribution: null, pointsLost: null }
    })
    return { area, status: reasons.length ? 'ineligible' : 'unranked', score: null, rank: null, reasons, breakdown }
  })
  const eligible = rows.filter((row) => row.status === 'unranked')
  if (eligible.length < 2) return { rows, message: 'Chưa đủ hai địa bàn có dữ liệu để so sánh.' }

  for (const [index, criterion] of criteria.entries()) {
    if (criterion.weight === 0) continue
    const values = eligible.map((row) => row.breakdown[index].metric.value as number)
    const min = Math.min(...values)
    const max = Math.max(...values)
    for (const [rowIndex, row] of eligible.entries()) {
      const value = values[rowIndex]
      const distance = criterion.direction === 'benefit' ? value - min : max - value
      const normalized = max === min ? 50 : 100 * (distance / (max - min))
      const contribution = criterion.weight * normalized / 100
      Object.assign(row.breakdown[index], { min, max, normalized, contribution, pointsLost: criterion.weight - contribution })
    }
  }
  for (const row of eligible) {
    row.score = row.breakdown.reduce((sum, item) => sum + (item.contribution ?? 0), 0)
    row.status = 'ranked'
  }
  eligible.sort((a, b) => b.score! - a.score!)
  const ranked: CandidateResult[] = []
  // Compare each tie to the highest score in its group to avoid chaining near ties.
  for (let i = 0; i < eligible.length;) {
    let end = i + 1
    while (end < eligible.length && eligible[i].score! - eligible[end].score! <= 1e-9) end++
    const group = eligible.slice(i, end).sort((a, b) => a.area.id.localeCompare(b.area.id))
    for (const row of group) row.rank = i + 1
    ranked.push(...group)
    i = end
  }
  return { rows: [...ranked, ...rows.filter((row) => row.status === 'ineligible')], message: null }
}
