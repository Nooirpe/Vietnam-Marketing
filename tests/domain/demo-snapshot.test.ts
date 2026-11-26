import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readFixture(file: string) {
  return JSON.parse(readFileSync(new URL(`../../public/data/v1/${file}`, import.meta.url), 'utf8'))
}

describe('demo snapshot', () => {
  it('links the geometries and market records to the administrative catalog', () => {
    const manifest = readFixture('manifest.json')
    const units = readFixture(manifest.files.units)
    const provinces = readFixture(manifest.files.provinces)
    const wards = readFixture(manifest.files.wards)
    const indicators = readFixture(manifest.files.dictionary)
    const observations = readFixture(manifest.files.observations)
    const evidence = readFixture(manifest.files.evidence)

    expect(provinces.features.map((feature: GeoJSON.Feature) => feature.properties?.geoId))
      .toEqual(['P01', 'P79'])
    expect(wards.features.map((feature: GeoJSON.Feature) => feature.properties?.geoId))
      .toEqual(['W00004', 'W00070', 'W26740'])
    expect(units).toContainEqual(expect.objectContaining({ id: 'W00070', code: '00070', parentId: 'P01' }))

    for (const row of [...observations, ...evidence]) {
      expect(units).toContainEqual(expect.objectContaining({ id: row.geoId }))
      expect(manifest.periods).toHaveProperty(row.period)
      expect(manifest.sources).toHaveProperty(row.sourceId)
      for (const code of Object.keys(row.values ?? row.answers ?? {})) {
        expect(indicators).toContainEqual(expect.objectContaining({ code }))
      }
    }
  })

  it('preserves zero, null and no_evidence independently', () => {
    expect(readFixture('market_observations.json')).toContainEqual(expect.objectContaining({
      geoId: 'W26740',
      values: expect.objectContaining({ spending: null, poi_density: 0 }),
    }))
    expect(readFixture('customer_evidence.json')).toContainEqual(expect.objectContaining({
      geoId: 'W26740',
      evidenceState: 'no_evidence',
      answers: null,
    }))
  })
})
