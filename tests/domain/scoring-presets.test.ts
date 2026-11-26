import { describe, expect, it } from 'vitest'
import { applyWeightPreset, allocateProportionalIntegerWeights } from '../../src/domain/scoringPresets'
import type { Criterion } from '../../src/domain/scoreCandidates'

const criteria: Criterion[] = [
  { code: 'unmet', direction: 'benefit', weight: 60, required: true },
  { code: 'poi_density', direction: 'cost', weight: 40, required: true },
  { code: 'spending', direction: 'benefit', weight: 0, required: false },
]

describe('scoring weight presets', () => {
  it('distributes whole percentages evenly and gives remainders deterministically', () => {
    expect(allocateProportionalIntegerWeights(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(applyWeightPreset(criteria, 'balanced').map(item => item.weight)).toEqual([34, 33, 33])
  })

  it('prioritizes the selected metric and equally splits the remainder', () => {
    expect(applyWeightPreset(criteria, 'demand').map(item => item.weight)).toEqual([60, 20, 20])
    expect(applyWeightPreset(criteria, 'competitors').map(item => item.weight)).toEqual([20, 60, 20])
    expect(applyWeightPreset(criteria, 'spending').map(item => item.weight)).toEqual([20, 20, 60])
  })

  it('uses an even preset if its priority metric is absent and assigns 100% to a lone priority metric', () => {
    expect(applyWeightPreset(criteria.slice(1), 'demand').map(item => item.weight)).toEqual([50, 50])
    expect(applyWeightPreset([criteria[0]], 'demand').map(item => item.weight)).toEqual([100])
    expect(allocateProportionalIntegerWeights(100, [0, 0])).toBeNull()
  })
})
