import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filterAreas, indexAreas, validThreshold } from '../../src/domain/filterAreas'
import type { FilterPredicate } from '../../src/domain/filterAreas'
import type { GeoUnit, Indicator } from '../../src/types/snapshot'

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../../public/data/v1/${name}`, import.meta.url), 'utf8'))
}

const areas = fixture('geo_units.json') as GeoUnit[]
const indicators = fixture('indicators.json') as Indicator[]
const populations = new Map<string, number>(fixture('market_observations.json').map((row: {
  geoId: string
  values: { population: number }
}) => [row.geoId, row.values.population]))
const preference = new Map<string, number | null>(fixture('customer_evidence.json').map((row: {
  geoId: string
  answers: { online: number } | null
}) => [row.geoId, row.answers?.online ?? null]))
const index = indexAreas(areas)
const defaults = {
  scope: 'auto',
  provinceId: null,
  query: '',
  predicates: [],
  getValue: (id, code) => code === 'population' ? populations.get(id) : preference.get(id),
} satisfies Parameters<typeof filterAreas>[1]

describe('area search', () => {
  it.each([
    ['hoan kiem', 'W00070'],
    ['Hoàn Kiếm', 'W00070'],
    ['00070', 'W00070'],
    ['ba dinh', 'W00004'],
    ['TP.HCM', 'P79'],
    ['TPHCM', 'P79'],
    ['hoan kiem ha noi', 'W00070'],
  ])('ranks %s correctly', (query, geoId) => {
    expect(filterAreas(index, { ...defaults, query }).rows[0]?.area.id).toBe(geoId)
  })

  it('uses current province wards in auto mode and can widen to all wards', () => {
    const local = filterAreas(index, { ...defaults, provinceId: 'P01' })
    expect(local.rows.map(row => row.area.id)).toEqual(['W00004', 'W00070'])
    const nationwide = filterAreas(index, { ...defaults, provinceId: 'P01', scope: 'ward' })
    expect(nationwide.rows).toHaveLength(3)
  })
})

describe('numeric area filters', () => {
  const predicates: FilterPredicate[] = [
    { code: 'population', operator: 'gt', threshold: 29_000 },
    { code: 'online', operator: 'gt', threshold: 50 },
  ]

  it('counts AND results independently of missing or zero measurements', () => {
    const result = filterAreas(index, { ...defaults, scope: 'ward', predicates })
    expect(result.counts).toEqual({ matched: 1, failed: 1, missing: 1 })
    expect(result.byGeoId.get('W00004')?.status).toBe('matched')
    expect(result.byGeoId.get('W00070')?.status).toBe('failed')
    expect(result.byGeoId.get('W26740')).toMatchObject({ status: 'missing', missing: [1] })
  })

  it('prioritizes known failure over indeterminate', () => {
    const result = filterAreas(index, {
      ...defaults,
      scope: 'ward',
      predicates: [{ ...predicates[0], threshold: 33_000 }, predicates[1]],
    })
    expect(result.counts).toEqual({ matched: 0, failed: 3, missing: 0 })
  })

  it('distinguishes zero and validates threshold domains', () => {
    const result = filterAreas(index, {
      ...defaults,
      scope: 'ward',
      predicates: [{ code: 'poi_density', operator: 'eq', threshold: 0 }],
      getValue: id => id === 'W26740' ? 0 : null,
    })
    expect(result.byGeoId.get('W26740')?.status).toBe('matched')
    expect(result.counts.missing).toBe(2)
    const population = indicators.find(indicator => indicator.code === 'population')!
    const online = indicators.find(indicator => indicator.code === 'online')!
    expect(validThreshold(population, 1.5)).toBe(false)
    expect(validThreshold(online, 100.1)).toBe(false)
    expect(validThreshold(online, Infinity)).toBe(false)
    expect(validThreshold(online, 0)).toBe(true)
  })
})
