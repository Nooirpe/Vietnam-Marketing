import type { Criterion } from './scoreCandidates'

export const weightPresets = [
  { id: 'balanced', label: 'Cân bằng', priorityCode: null },
  { id: 'demand', label: 'Ưu tiên nhu cầu', priorityCode: 'unmet' },
  { id: 'competitors', label: 'Ưu tiên ít đối thủ', priorityCode: 'poi_density' },
  { id: 'spending', label: 'Ưu tiên sức mua', priorityCode: 'spending' },
] as const

export type WeightPresetId = typeof weightPresets[number]['id']

function presetWeights(total: number, weights: readonly number[]) {
  const allocation = allocateProportionalIntegerWeights(total, weights)
  if (!allocation) throw new Error('Unable to allocate preset weights')
  return allocation
}

export function allocateProportionalIntegerWeights(total: number, weights: readonly number[]): number[] | null {
  if (!Number.isInteger(total) || total < 0 || weights.some(weight => !Number.isFinite(weight) || weight < 0)) return null
  if (weights.length === 0) return total === 0 ? [] : null
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)
  if (weightTotal === 0) return total === 0 ? weights.map(() => 0) : null

  const exact = weights.map(weight => total * weight / weightTotal)
  const allocated = exact.map(Math.floor)
  let remainder = total - allocated.reduce((sum, weight) => sum + weight, 0)
  const order = exact
    .map((weight, index) => ({ index, fraction: weight - allocated[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
  for (const { index } of order) {
    if (remainder === 0) break
    allocated[index] += 1
    remainder -= 1
  }
  return allocated
}

export function applyWeightPreset(criteria: readonly Criterion[], presetId: WeightPresetId): Criterion[] {
  if (criteria.length === 0) return []
  const preset = weightPresets.find(item => item.id === presetId)
  if (!preset) throw new Error(`Unknown weight preset: ${presetId}`)
  if (preset.priorityCode === null) {
    const weights = presetWeights(100, criteria.map(() => 1))
    return criteria.map((criterion, index) => ({ ...criterion, weight: weights[index] }))
  }

  const priorityIndex = criteria.findIndex(criterion => criterion.code === preset.priorityCode)
  if (priorityIndex < 0) {
    const weights = presetWeights(100, criteria.map(() => 1))
    return criteria.map((criterion, index) => ({ ...criterion, weight: weights[index] }))
  }
  if (criteria.length === 1) return [{ ...criteria[0], weight: 100 }]

  const otherIndices = criteria.flatMap((_, index) => index === priorityIndex ? [] : [index])
  const otherWeights = presetWeights(40, otherIndices.map(() => 1))
  return criteria.map((criterion, index) => ({
    ...criterion,
    weight: index === priorityIndex
      ? 60
      : otherWeights[otherIndices.indexOf(index)],
  }))
}
