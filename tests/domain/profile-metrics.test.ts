import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareWithMedian, median, rangePercentages, selectPeerUnits } from '../../src/domain/profileMetrics'
import type { GeoUnit } from '../../src/types/snapshot'

const units = JSON.parse(readFileSync(new URL('../../public/data/v1/geo_units.json', import.meta.url), 'utf8')) as GeoUnit[]
const unitsById = new Map(units.map(unit => [unit.id, unit]))

describe('profile peer metrics', () => {
  it('selects other provinces and wards in the same province only', () => {
    expect(selectPeerUnits(units, unitsById.get('P01')!).map(unit => unit.id)).toEqual(['P79'])
    expect(selectPeerUnits(units, unitsById.get('W00004')!).map(unit => unit.id)).toEqual(['W00070'])
    expect(selectPeerUnits(units, unitsById.get('W26740')!)).toEqual([])
  })

  it('calculates medians for odd, even, and empty peer samples', () => {
    expect(median([9, 1, 5])).toBe(5)
    expect(median([1, 4, 8, 10])).toBe(6)
    expect(median([Infinity, NaN])).toBeNull()
  })

  it('compares a metric to its peer median without hiding unavailable references', () => {
    expect(compareWithMedian(12, 10)).toEqual({ direction: 'above', difference: 2 })
    expect(compareWithMedian(8, 10)).toEqual({ direction: 'below', difference: -2 })
    expect(compareWithMedian(10, 10)).toEqual({ direction: 'equal', difference: 0 })
    expect(compareWithMedian(null, 10)).toEqual({ direction: 'unavailable', difference: null })
    expect(compareWithMedian(10, null)).toEqual({ direction: 'unavailable', difference: null })
    expect(compareWithMedian(Infinity, 10)).toEqual({ direction: 'unavailable', difference: null })
  })

  it('places a WTP interval on its scale, including a zero-only interval', () => {
    expect(rangePercentages(25, 50, 100)).toEqual({ start: 25, width: 25 })
    expect(rangePercentages(0, 0, 0)).toEqual({ start: 0, width: 0 })
    expect(rangePercentages(5, 15, 10)).toEqual({ start: 50, width: 50 })
  })
})
