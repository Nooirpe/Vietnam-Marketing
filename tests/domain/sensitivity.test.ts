import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../../src/data/indexes'
import { evidenceSchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema } from '../../src/data/schemas'
import { analyzeSensitivity, adjustCriterionWeights } from '../../src/domain/sensitivity'
import { defaultCriteria } from '../../src/domain/scoreCandidates'
import type { Criterion } from '../../src/domain/scoreCandidates'

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../../public/data/v1/${name}`, import.meta.url), 'utf8'))
}

const snapshot = indexSnapshot(
  manifestSchema.parse(fixture('manifest.json')),
  unitsSchema.parse(fixture('geo_units.json')),
  indicatorsSchema.parse(fixture('indicators.json')),
  observationsSchema.parse(fixture('market_observations.json')),
  evidenceSchema.parse(fixture('customer_evidence.json')),
)
const context = { period: '2025-Q3', segment: 'urban_adults', study: 'grocery_delivery_v1' }

describe('weight sensitivity analysis', () => {
  it('moves ten points and proportionally redistributes the remainder as integers', () => {
    const criteria: Criterion[] = [
      { code: 'unmet', direction: 'benefit', weight: 60, required: false },
      { code: 'poi_density', direction: 'cost', weight: 20, required: false },
      { code: 'spending', direction: 'benefit', weight: 20, required: false },
    ]
    expect(adjustCriterionWeights(criteria, 0, 10)?.map(item => item.weight)).toEqual([70, 15, 15])
    expect(adjustCriterionWeights(criteria, 0, -10)?.map(item => item.weight)).toEqual([50, 25, 25])
    expect(adjustCriterionWeights(defaultCriteria, 0, -10)?.map(item => item.weight)).toEqual([50, 50])
  })

  it('marks impossible perturbations unavailable and reports rank changes per scenario', () => {
    const edgeWeights: Criterion[] = [
      { code: 'unmet', direction: 'benefit', weight: 5, required: false },
      { code: 'poi_density', direction: 'cost', weight: 95, required: false },
    ]
    expect(adjustCriterionWeights(edgeWeights, 0, -10)).toBeNull()
    const result = analyzeSensitivity(snapshot, ['P01', 'P79'], defaultCriteria, context)
    expect(result).toHaveLength(2)
    expect(result[0].scenarios.map(scenario => scenario.delta)).toEqual([-10, 10])
    expect(result.some(criterion => criterion.scenarios.some(scenario => scenario.rankChanges.length > 0))).toBe(true)
  })
})
