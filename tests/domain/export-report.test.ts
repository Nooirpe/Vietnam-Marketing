import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../../src/data/indexes'
import {
  evidenceSchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema,
} from '../../src/data/schemas'
import { defaultCriteria, scoreCandidates } from '../../src/domain/scoreCandidates'
import {
  buildXlsxBytes, createReport, reportToCsv, reportToSpreadsheet, spreadsheetSheetXml,
} from '../../src/utils/exportReport'

function fixture(file: string) {
  return JSON.parse(readFileSync(new URL(`../../public/data/v1-boundaries/${file}`, import.meta.url), 'utf8'))
}

const manifest = manifestSchema.parse(fixture('manifest.json'))
const snapshot = indexSnapshot(
  manifest,
  unitsSchema.parse(fixture('geo_units.json')),
  indicatorsSchema.parse(fixture('indicators.json')),
  observationsSchema.parse(fixture('market_observations.json')),
  evidenceSchema.parse(fixture('customer_evidence.json')),
)
const context = { period: '2025-Q3', segment: 'urban_adults', study: 'grocery_delivery_v1' }
const ids = ['W00004', 'W00070']
const result = scoreCandidates(snapshot, ids, defaultCriteria, context)
const report = createReport(snapshot, context, defaultCriteria, ids, result, new Date('2026-01-01T00:00:00.000Z'))

describe('report spreadsheet exports', () => {
  it('creates the requested ranking, criterion detail, and source sheets', () => {
    const sheets = reportToSpreadsheet(report)
    expect(Object.keys(sheets)).toEqual(['Xếp hạng', 'Chi tiết tiêu chí', 'Nguồn'])
    expect(sheets['Xếp hạng'][0]).toContain('Điểm')
    expect(sheets['Chi tiết tiêu chí'][1]).toContain('unmet')
    expect(sheets['Nguồn'].slice(1).some((row) => row[0] === 'SIM-S')).toBe(true)
  })

  it('records the selected industry in JSON and CSV reports', () => {
    const industryReport = createReport(
      snapshot, context, defaultCriteria, ids, result, new Date('2026-01-01T00:00:00.000Z'),
      { sector: 'coffee', sectorName: 'Coffee / F&B' },
    )
    expect(industryReport).toMatchObject({ sector: 'coffee', sectorName: 'Coffee / F&B' })
    expect(reportToCsv(industryReport)).toContain('"coffee","Coffee / F&B"')
  })

  it('writes text as inline strings and escapes XML-sensitive characters', () => {
    const xml = spreadsheetSheetXml([['Nội dung'], ['=SUM(A1)&<x>']])
    expect(xml).toContain('t="inlineStr"')
    expect(xml).toContain('=SUM(A1)&amp;&lt;x&gt;')
    expect(xml).not.toContain('<f>')
  })

  it('produces a valid ZIP workbook containing all three sheets', async () => {
    const bytes = await buildXlsxBytes(reportToSpreadsheet(report))
    const { strFromU8, unzipSync } = await import('fflate')
    const files = unzipSync(bytes)
    const workbook = strFromU8(files['xl/workbook.xml'])
    expect(workbook).toContain('Xếp hạng')
    expect(workbook).toContain('Chi tiết tiêu chí')
    expect(workbook).toContain('Nguồn')
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('Hạng')
  })
})
