import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../../src/data/indexes'
import { evidenceSchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema } from '../../src/data/schemas'
import { algorithmVersionV2, scoreCandidates, type Criterion, type ScoringOptions } from '../../src/domain/scoreCandidates'
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
const wards = ['W00004', 'W00070', 'W26740']
const poiCriterion: Criterion[] = [{ code: 'poi_density', direction: 'cost', weight: 100, required: false }]
const sameLevel: ScoringOptions = { algorithmVersion: algorithmVersionV2, normalizationScope: 'same-level' }

describe('min-max-v2 scoring', () => {
  it('uses the entire same-level population and remains independent of selected candidates', () => {
    const selected = scoreCandidates(snapshot, wards.slice(0, 2), poiCriterion, context, sameLevel)
    const expanded = scoreCandidates(snapshot, wards, poiCriterion, context, sameLevel)
    const selectedBaDinh = selected.rows.find(row => row.area.id === 'W00004')
    const expandedBaDinh = expanded.rows.find(row => row.area.id === 'W00004')
    expect(selectedBaDinh?.score).toBe(expandedBaDinh?.score)
    expect(selectedBaDinh?.breakdown[0]).toMatchObject({ min: 0, max: 4, normalized: 50 })
    expect(scoreCandidates(snapshot, wards.slice(0, 2), poiCriterion, context, {
      ...sameLevel, normalizationScope: 'candidates',
    }).rows[0].breakdown[0]).toMatchObject({ min: 2, max: 4, normalized: 100 })
  })

  it('scores constant ranges at 50 and assigns equal scores the same rank', () => {
    const constantObservations = observations.map(row => wards.includes(row.geoId)
      ? { ...row, values: { ...row.values, population: 10_000 } }
      : row)
    const constantSnapshot = indexSnapshot(manifest, units, indicators, constantObservations, evidence)
    const criteria: Criterion[] = [{ code: 'population', direction: 'benefit', weight: 100, required: false }]
    const result = scoreCandidates(constantSnapshot, wards.slice(0, 2), criteria, context, sameLevel)
    expect(result.rows.map(row => [row.score, row.rank])).toEqual([[50, 1], [50, 1]])
    expect(result.rows[0].breakdown[0]).toMatchObject({ min: 10_000, max: 10_000, normalized: 50 })
  })

  it('excludes missing scored values and enforces independent hard constraints', () => {
    const zeroWeightRequired: Criterion[] = [
      { code: 'population', direction: 'benefit', weight: 100, required: false },
      { code: 'spending', direction: 'benefit', weight: 0, required: true },
    ]
    expect(scoreCandidates(snapshot, wards, zeroWeightRequired, context, sameLevel)
      .rows.find(row => row.area.id === 'W26740')?.status).toBe('ranked')

    const spending: Criterion[] = [{ code: 'spending', direction: 'benefit', weight: 100, required: true }]
    const missingScore = scoreCandidates(snapshot, wards, spending, context, sameLevel)
    expect(missingScore.rows.find(row => row.area.id === 'W26740')).toMatchObject({ status: 'ineligible' })

    const constrained = scoreCandidates(
      snapshot,
      wards,
      [{ code: 'population', direction: 'benefit', weight: 100, required: false }],
      context,
      { ...sameLevel, constraints: [{ code: 'poi_density', operator: 'lte', threshold: 2 }] },
    )
    expect(constrained.rows.find(row => row.area.id === 'W00070')).toMatchObject({
      status: 'ineligible',
      constraintResults: [{ passed: false }],
    })
    expect(constrained.rows.find(row => row.area.id === 'W00070')?.reasons.join(' ')).toContain('Ràng buộc cứng')
    expect(constrained.rows.find(row => row.area.id === 'W00004')?.constraintResults).toMatchObject([{ passed: true }])

    const missingConstraint = scoreCandidates(
      snapshot,
      wards,
      [{ code: 'population', direction: 'benefit', weight: 100, required: false }],
      context,
      { ...sameLevel, constraints: [{ code: 'spending', operator: 'gte', threshold: 1 }] },
    )
    expect(missingConstraint.rows.find(row => row.area.id === 'W26740')?.reasons.join(' ')).toContain('Chưa thu thập')
  })

  it('rejects invalid constraints and more than six criteria', () => {
    const invalidConstraint = scoreCandidates(snapshot, wards, poiCriterion, context, {
      ...sameLevel, constraints: [{ code: 'wtp', operator: 'gte', threshold: 1 }],
    })
    expect(invalidConstraint.message).toContain('Ràng buộc')
    expect(scoreCandidates(snapshot, wards, poiCriterion, context, {
      ...sameLevel, constraints: [{ code: 'unmet', operator: 'gte', threshold: 101 }],
    }).message).toContain('Ràng buộc')
    const tooMany: Criterion[] = indicators
      .filter(indicator => indicator.code !== 'wtp')
      .slice(0, 7)
      .map((indicator, index) => ({
        code: indicator.code,
        direction: 'benefit',
        weight: index === 0 ? 100 : 0,
        required: false,
      }))
    expect(scoreCandidates(snapshot, wards.slice(0, 2), tooMany, context, sameLevel).message).toContain('sáu')
  })

  it('records the selected v2 algorithm and normalization scope in JSON and CSV reports', () => {
    const result = scoreCandidates(snapshot, wards.slice(0, 2), poiCriterion, context, sameLevel)
    const report = createReport(snapshot, context, poiCriterion, wards.slice(0, 2), result, new Date('2026-11-26T00:00:00Z'), {
      ...sameLevel, preset: 'Cân bằng',
    })
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({
      algorithmVersion: 'min-max-v2',
      normalizationScope: 'same-level',
      preset: 'Cân bằng',
    })
    expect(reportToCsv(report).split('\r\n')[1]).toContain('"min-max-v2","same-level","[]"')
  })
})
