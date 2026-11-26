import { resolveMetric, type ResolvedMetric } from './resolveMetric'
import { normalizeMinMax } from './normalizeMinMax'
import { isScalarIndicator, validThreshold } from './filterAreas'
import { defaultSectorId, getSectorPreset } from './presets'
import type { SectorId } from './presets'
import type { GeoUnit, MetricContext, Snapshot } from '../types/snapshot'

export const algorithmVersion = 'min-max-v1'
export const algorithmVersionV2 = 'min-max-v2'
export type ScoringAlgorithmVersion = typeof algorithmVersion | typeof algorithmVersionV2
export type NormalizationScope = 'candidates' | 'same-level'
export const preset = 'Tùy chỉnh'
export const directionText = { benefit: 'Càng cao càng tốt', cost: 'Càng thấp càng tốt' }

export interface HardConstraint {
  code: string
  operator: 'gte' | 'lte'
  threshold: number
}

export interface ScoringOptions {
  algorithmVersion?: ScoringAlgorithmVersion
  normalizationScope?: NormalizationScope
  constraints?: readonly HardConstraint[]
  preset?: string
  sector?: SectorId
  sectorName?: string
}

export interface Criterion {
  code: string
  direction: 'benefit' | 'cost'
  weight: number
  required: boolean
}

export const defaultCriteria: Criterion[] = getSectorPreset(defaultSectorId)!.criteria

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
  constraintResults?: ConstraintResult[]
}

export interface ConstraintResult {
  constraint: HardConstraint
  name: string
  metric: ResolvedMetric
  passed: boolean
  reason: string | null
}

export interface ScoreResult {
  rows: CandidateResult[]
  message: string | null
}

export function scoreCandidates(
  snapshot: Snapshot,
  ids: readonly string[],
  criteria: readonly Criterion[],
  context: MetricContext,
  options: ScoringOptions = {},
): ScoreResult {
  const version = options.algorithmVersion ?? algorithmVersion
  const isV2 = version === algorithmVersionV2
  const normalizationScope = isV2 ? options.normalizationScope ?? 'candidates' : 'candidates'
  const constraints = isV2 ? options.constraints ?? [] : []
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
      criteria.some(({ code }) => {
        const indicator = snapshot.indicatorsByCode.get(code)
        return !indicator || !isScalarIndicator(indicator)
      })) {
    return { rows: [], message: 'Các tiêu chí phải khác nhau và có giá trị số vô hướng.' }
  }
  if (isV2 && criteria.length > 6) return { rows: [], message: 'Chọn tối đa sáu tiêu chí chấm điểm.' }
  if (isV2 && (
    new Set(constraints.map(({ code }) => code)).size !== constraints.length ||
    constraints.some(({ code, threshold }) => {
      const indicator = snapshot.indicatorsByCode.get(code)
      return !indicator || !isScalarIndicator(indicator) || !validThreshold(indicator, threshold)
    })
  )) {
    return { rows: [], message: 'Ràng buộc phải dùng chỉ tiêu số vô hướng khác nhau và ngưỡng hợp lệ.' }
  }

  const rows: CandidateResult[] = (areas as GeoUnit[]).map((area) => {
    const reasons: string[] = []
    const breakdown = criteria.map((criterion): Breakdown => {
      const metric = resolveMetric(snapshot, area.id, criterion.code, context)
      const name = snapshot.indicatorsByCode.get(criterion.code)!.name
      const missingIsRequired = isV2 ? criterion.weight > 0 : criterion.required || criterion.weight > 0
      if (missingIsRequired && typeof metric.value !== 'number') {
        reasons.push(`${name} · ${metric.reason ?? 'Giá trị không phải số vô hướng'}`)
      }
      return {
        criterion: { ...criterion, ...(isV2 ? { required: false } : {}) },
        name, metric, min: null, max: null, normalized: null, contribution: null, pointsLost: null,
      }
    })
    const constraintResults = constraints.map((constraint): ConstraintResult => {
      const metric = resolveMetric(snapshot, area.id, constraint.code, context)
      const name = snapshot.indicatorsByCode.get(constraint.code)!.name
      const value = typeof metric.value === 'number' ? metric.value : null
      const passed = value !== null && (constraint.operator === 'gte'
        ? value >= constraint.threshold
        : value <= constraint.threshold)
      const reason = value === null
        ? `${name} · ${metric.reason ?? 'Thiếu dữ liệu cho ràng buộc'}`
        : passed ? null : `${name} · ${formatConstraintFailure(value, constraint)}`
      if (!passed && reason) reasons.push(`Ràng buộc cứng: ${reason}`)
      return { constraint, name, metric, passed, reason }
    })
    return {
      area, status: reasons.length ? 'ineligible' : 'unranked', score: null, rank: null, reasons, breakdown,
      ...(isV2 ? { constraintResults } : {}),
    }
  })
  const eligible = rows.filter((row) => row.status === 'unranked')
  if (eligible.length < 2) {
    return {
      rows,
      message: isV2
        ? 'Chưa đủ hai địa bàn có dữ liệu và đạt các ràng buộc để so sánh.'
        : 'Chưa đủ hai địa bàn có dữ liệu để so sánh.',
    }
  }

  for (const [index, criterion] of criteria.entries()) {
    if (criterion.weight === 0) continue
    const normalizationRows = normalizationScope === 'same-level'
      ? snapshot.units.filter((unit) => unit.level === eligible[0].area.level)
      : eligible.map((row) => row.area)
    const values = normalizationRows.flatMap((area) => {
      const value = resolveMetric(snapshot, area.id, criterion.code, context).value
      return typeof value === 'number' ? [value] : []
    })
    if (values.length === 0) continue
    const min = Math.min(...values)
    const max = Math.max(...values)
    for (const row of eligible) {
      const value = row.breakdown[index].metric.value
      if (typeof value !== 'number') continue
      const normalized = normalizeMinMax(value, min, max, criterion.direction)
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

export function scoreOpportunityAreas(
  snapshot: Snapshot,
  ids: readonly string[],
  context: MetricContext,
): ReadonlyMap<string, number | null> {
  const scores = new Map(ids.map(id => [id, null as number | null]))
  const groups = new Map<GeoUnit['level'], string[]>()
  for (const id of ids) {
    const area = snapshot.unitsById.get(id)
    if (!area || area.level === 'country') continue
    const group = groups.get(area.level) ?? []
    group.push(id)
    groups.set(area.level, group)
  }
  for (const group of groups.values()) {
    const result = scoreCandidates(snapshot, group, defaultCriteria, context, {
      algorithmVersion: algorithmVersionV2,
      normalizationScope: 'same-level',
    })
    for (const row of result.rows) {
      scores.set(row.area.id, row.status === 'ranked' ? row.score : null)
    }
  }
  return scores
}

export function rankOpportunityAreas(
  scores: ReadonlyMap<string, number | null>,
  ids: readonly string[],
  limit: number,
): { ids: string[]; eligibleCount: number } {
  const ranked = ids.flatMap(id => {
    const score = scores.get(id)
    return typeof score === 'number' && Number.isFinite(score) ? [{ id, score }] : []
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0
  return { ids: ranked.slice(0, count).map(item => item.id), eligibleCount: ranked.length }
}

function formatConstraintFailure(value: number, constraint: HardConstraint) {
  return constraint.operator === 'gte'
    ? `${value} dưới ngưỡng tối thiểu ${constraint.threshold}`
    : `${value} vượt ngưỡng tối đa ${constraint.threshold}`
}
