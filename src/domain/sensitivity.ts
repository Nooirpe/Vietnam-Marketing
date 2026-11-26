import type { MetricContext, Snapshot } from '../types/snapshot'
import { scoreCandidates, type Criterion, type ScoringOptions } from './scoreCandidates'
import { allocateProportionalIntegerWeights } from './scoringPresets'

export type SensitivityDelta = -10 | 10

export interface RankChange {
  areaId: string
  areaName: string
  before: number | null
  after: number | null
}

export interface SensitivityScenario {
  delta: SensitivityDelta
  feasible: boolean
  reason: string | null
  rankChanges: RankChange[]
}

export interface CriterionSensitivity {
  code: string
  name: string
  scenarios: SensitivityScenario[]
  status: 'stable' | 'sensitive' | 'unavailable'
}

export function adjustCriterionWeights(
  criteria: readonly Criterion[],
  criterionIndex: number,
  delta: SensitivityDelta,
): Criterion[] | null {
  if (criteria.length < 2 || !Number.isInteger(criterionIndex) || criterionIndex < 0 || criterionIndex >= criteria.length) return null
  if (criteria.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 100)) return null
  if (criteria.reduce((sum, criterion) => sum + criterion.weight, 0) !== 100) return null

  const targetWeight = criteria[criterionIndex].weight + delta
  if (targetWeight < 0 || targetWeight > 100) return null

  const otherIndices = criteria.flatMap((_, index) => index === criterionIndex ? [] : [index])
  const remainingWeights = allocateProportionalIntegerWeights(
    100 - targetWeight,
    otherIndices.map(index => criteria[index].weight),
  )
  if (!remainingWeights) return null
  return criteria.map((criterion, index) => ({
    ...criterion,
    weight: index === criterionIndex
      ? targetWeight
      : remainingWeights[otherIndices.indexOf(index)],
  }))
}

export function analyzeSensitivity(
  snapshot: Snapshot,
  ids: readonly string[],
  criteria: readonly Criterion[],
  context: MetricContext,
  options: ScoringOptions = {},
): CriterionSensitivity[] {
  const baseline = scoreCandidates(snapshot, ids, criteria, context, options)
  if (baseline.message) {
    return criteria.map(criterion => ({
      code: criterion.code,
      name: snapshot.indicatorsByCode.get(criterion.code)?.name ?? criterion.code,
      scenarios: ([-10, 10] as const).map(delta => ({
        delta,
        feasible: false,
        reason: baseline.message,
        rankChanges: [],
      })),
      status: 'unavailable',
    }))
  }
  const baseRanks = new Map(baseline.rows.map(row => [row.area.id, row.rank]))

  return criteria.map((criterion, criterionIndex) => {
    const scenarios = ([-10, 10] as const).map((delta): SensitivityScenario => {
      const adjusted = adjustCriterionWeights(criteria, criterionIndex, delta)
      if (!adjusted) {
        return {
          delta,
          feasible: false,
          reason: `Không thể thay đổi trọng số ${delta > 0 ? '+' : ''}${delta} điểm trong giới hạn 0–100.`,
          rankChanges: [],
        }
      }
      const result = scoreCandidates(snapshot, ids, adjusted, context, options)
      if (result.message) {
        return { delta, feasible: false, reason: result.message, rankChanges: [] }
      }
      const rankChanges = result.rows.flatMap(row => {
        const before = baseRanks.get(row.area.id) ?? null
        const after = row.rank
        return before === after ? [] : [{ areaId: row.area.id, areaName: row.area.name, before, after }]
      })
      return { delta, feasible: true, reason: null, rankChanges }
    })
    const feasibleScenarios = scenarios.filter(scenario => scenario.feasible)
    return {
      code: criterion.code,
      name: snapshot.indicatorsByCode.get(criterion.code)?.name ?? criterion.code,
      scenarios,
      status: feasibleScenarios.length === 0
        ? 'unavailable'
        : feasibleScenarios.some(scenario => scenario.rankChanges.length > 0) ? 'sensitive' : 'stable',
    }
  })
}
