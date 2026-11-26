import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../../src/data/indexes'
import { evidenceSchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema } from '../../src/data/schemas'
import { rankOpportunityAreas, scoreOpportunityAreas } from '../../src/domain/scoreCandidates'

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

describe('opportunity score', () => {
  it('uses shared scoring across each administrative level and leaves incomplete areas unranked', () => {
    const scores = scoreOpportunityAreas(snapshot, snapshot.units.map(unit => unit.id), context)
    expect(scores.get('P79')).toBeGreaterThan(scores.get('P01') ?? -1)
    expect(scores.get('W00004')).toBeGreaterThan(scores.get('W00070') ?? -1)
    expect(scores.get('W26740')).toBeNull()
  })

  it('ranks only finite scores, applies a maximum, and uses geoId for ties', () => {
    const ranked = rankOpportunityAreas(new Map([
      ['P01', 50], ['P79', 100], ['W00004', 50], ['W00070', null],
    ]), ['P01', 'P79', 'W00004', 'W00070'], 2)
    expect(ranked).toEqual({ ids: ['P79', 'P01'], eligibleCount: 3 })
    expect(rankOpportunityAreas(new Map([['P01', Number.NaN]]), ['P01'], 10))
      .toEqual({ ids: [], eligibleCount: 0 })
  })
})
