import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../../src/data/indexes'
import {
  evidenceSchema,
  indicatorsSchema,
  manifestSchema,
  observationsSchema,
  unitsSchema,
} from '../../src/data/schemas'
import { resolveMetricTrend } from '../../src/domain/metricTrend'

function fixture(file: string) {
  return JSON.parse(readFileSync(new URL(`../../public/data/v1-boundaries/${file}`, import.meta.url), 'utf8'))
}

const manifest = manifestSchema.parse(fixture('manifest.json'))
const units = unitsSchema.parse(fixture('geo_units.json'))
const indicators = indicatorsSchema.parse(fixture('indicators.json'))
const observations = observationsSchema.parse(fixture('market_observations.json'))
const evidence = evidenceSchema.parse(fixture('customer_evidence.json'))

describe('boundary dataset integrity', () => {
  it('indexes all shipped observations and evidence against known units, periods, and sources', () => {
    expect(() => indexSnapshot(manifest, units, indicators, observations, evidence)).not.toThrow()
    expect(manifest.isDemo).toBe(true)
  })

  it('rejects duplicate market and survey keys', () => {
    expect(() => indexSnapshot(manifest, units, indicators, [...observations, observations[0]], evidence))
      .toThrow('khóa trùng')
    expect(() => indexSnapshot(manifest, units, indicators, observations, [...evidence, evidence[0]]))
      .toThrow('khóa trùng')
  })

  it('rejects out-of-range survey percentages and invalid statuses', () => {
    const invalidPercentage = {
      ...evidence[0],
      evidenceState: 'available',
      status: 'estimated',
      answers: { ...evidence[0].answers, unmet: 101 },
    }
    expect(evidenceSchema.safeParse(invalidPercentage).success).toBe(false)
    expect(evidenceSchema.safeParse({ ...evidence[0], status: 'draft' }).success).toBe(false)
    expect(observationsSchema.safeParse({ ...observations[0], status: 'draft' }).success).toBe(false)
  })

  it('orders numeric trends by quarter and keeps missing periods as gaps', () => {
    const trendManifest = manifestSchema.parse({
      ...manifest,
      periods: {
        ...manifest.periods,
        '2025-Q1': { start: '2025-01-01', end: '2025-03-31' },
        '2025-Q2': { start: '2025-04-01', end: '2025-06-30' },
      },
    })
    const trendObservations = observationsSchema.parse([
      ...observations,
      {
        geoId: 'W00004',
        period: '2025-Q1',
        sourceId: 'SIM-M',
        status: 'estimated',
        values: { population: 10000 },
        missingReasons: {},
      },
    ])
    const snapshot = indexSnapshot(trendManifest, units, indicators, trendObservations, evidence)
    expect(resolveMetricTrend(snapshot, 'W00004', 'population', {
      period: '2025-Q3', segment: 'urban_adults', study: 'grocery_delivery_v1',
    })).toEqual([
      { period: '2025-Q1', value: 10000, status: 'estimated' },
      { period: '2025-Q2', value: null, status: 'unavailable' },
      { period: '2025-Q3', value: 30000, status: 'estimated' },
    ])
  })
})
