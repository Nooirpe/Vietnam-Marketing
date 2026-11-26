import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../../src/data/indexes'
import { evidenceSchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema } from '../../src/data/schemas'
import { defaultCriteria, scoreCandidates } from '../../src/domain/scoreCandidates'
import { createReport, reportToCsv } from '../../src/utils/exportReport'

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../../public/data/v1/${name}`, import.meta.url), 'utf8'))
}

const manifest = manifestSchema.parse(fixture('manifest.json'))
const units = unitsSchema.parse(fixture('geo_units.json'))
const indicators = indicatorsSchema.parse(fixture('indicators.json'))
const observations = observationsSchema.parse(fixture('market_observations.json'))
const evidence = evidenceSchema.parse(fixture('customer_evidence.json'))
const snapshot = indexSnapshot(manifest, units, indicators, observations, evidence)
const context = { period: '2025-Q3', segment: 'urban_adults', study: 'grocery_delivery_v1' }
const provinces = ['P01', 'P79']
const wards = ['W00004', 'W00070', 'W26740']
const ranking = (result: ReturnType<typeof scoreCandidates>) => result.rows.map((row) => [row.area.id, row.score, row.rank])

describe('Min–Max decision support', () => {
  it('uses both directions and changes rank when weights change', () => {
    expect(ranking(scoreCandidates(snapshot, provinces, defaultCriteria, context))).toEqual([['P79', 60, 1], ['P01', 40, 2]])
    const adjusted = defaultCriteria.map((criterion, index) => ({ ...criterion, weight: [30, 70][index] }))
    const result = scoreCandidates(snapshot, provinces, adjusted, context)
    expect(ranking(result)).toEqual([['P01', 70, 1], ['P79', 30, 2]])
    expect(result.rows[0].breakdown[1]).toMatchObject({ min: 3, max: 5, normalized: 100, contribution: 70 })
  })

  it('refuses missing required values before deriving bounds even with weight zero', () => {
    const result = scoreCandidates(snapshot, wards, defaultCriteria, context)
    expect(ranking(result)).toEqual([['W00004', 100, 1], ['W00070', 0, 2], ['W26740', null, null]])
    expect(result.rows[0].breakdown[1]).toMatchObject({ min: 2, max: 4 })
    expect(result.rows[2]).toMatchObject({ status: 'ineligible', breakdown: [{ metric: { value: null } }, { metric: { value: 0 } }] })
    const allCost = defaultCriteria.map((criterion) => ({ ...criterion, weight: criterion.direction === 'cost' ? 100 : 0 }))
    expect(scoreCandidates(snapshot, wards, allCost, context).rows[2].status).toBe('ineligible')
  })

  it('uses 50 for a constant criterion and assigns ties stably', () => {
    const samePoi = observations.map((row) => provinces.includes(row.geoId) ? { ...row, values: { ...row.values, poi_density: 4 } } : row)
    const constant = indexSnapshot(manifest, units, indicators, samePoi, evidence)
    expect(scoreCandidates(constant, provinces, defaultCriteria, context).rows[0].breakdown[1])
      .toMatchObject({ min: 4, max: 4, normalized: 50, contribution: 20 })
    const sameAll = evidence.map((row) => row.geoId === 'P79' && row.answers ? { ...row, answers: { ...row.answers, unmet: 40 } } : row)
    const tied = indexSnapshot(manifest, units, indicators, samePoi, sameAll)
    expect(ranking(scoreCandidates(tied, [...provinces].reverse(), defaultCriteria, context))).toEqual([['P01', 50, 1], ['P79', 50, 1]])
  })

  it('applies completeness to an optional positive-weight criterion and rejects invalid scenarios', () => {
    const optional: typeof defaultCriteria = [
      { ...defaultCriteria[0], weight: 0 }, { ...defaultCriteria[1], weight: 80 },
      { code: 'spending', direction: 'benefit', required: false, weight: 20 },
    ]
    expect(scoreCandidates(snapshot, wards, optional, context).rows[2].reasons).toHaveLength(2)
    expect(scoreCandidates(snapshot, ['P01', 'W00004'], defaultCriteria, context).message).toContain('cùng cấp')
    expect(scoreCandidates(snapshot, provinces, [defaultCriteria[0]], context).message).toContain('100%')
    const tooFew = scoreCandidates(snapshot, ['W00004', 'W26740'], defaultCriteria, context)
    expect(tooFew.message).toContain('Chưa đủ hai')
    expect(tooFew.rows.map((row) => row.status)).toEqual(['unranked', 'ineligible'])
  })

  it('exports reproducible totals and keeps excluded rows in both formats', () => {
    const result = scoreCandidates(snapshot, wards, defaultCriteria, context)
    const report = createReport(snapshot, context, defaultCriteria, wards, result, new Date('2026-11-26T00:00:00Z'))
    const roundTrip = JSON.parse(JSON.stringify(report)) as typeof report
    expect(roundTrip).toMatchObject({ algorithmVersion: 'min-max-v1', exportedAt: '2026-11-26T00:00:00.000Z', candidateIds: wards, isDemo: true })
    for (const row of roundTrip.rows.filter((candidate) => candidate.status === 'ranked')) {
      expect(row.breakdown.reduce((sum, item) => sum + item.criterion.weight * (item.normalized ?? 0) / 100, 0)).toBe(row.score)
    }
    expect(roundTrip.rows.at(-1)).toMatchObject({ status: 'ineligible', score: null, rank: null })
    const csv = reportToCsv(report)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.trimEnd().split('\r\n')).toHaveLength(7)
    expect(csv).toContain('"W00004","00004","Phường Ba Đình"')
    expect(csv).toContain('"W26740","26740","Phường Sài Gòn","ward","ineligible",,,')
    expect(csv).toContain('Mẫu thuận tiện mô phỏng, bảng hỏi v1')
  })
})
