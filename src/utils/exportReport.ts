import { algorithmVersion, algorithmVersionV2, preset, type Criterion, type ScoreResult, type ScoringOptions } from '../domain/scoreCandidates'
import { defaultSectorId, getSectorPreset } from '../domain/presets'
import type { MetricContext, Snapshot } from '../types/snapshot'

export function createReport(
  snapshot: Snapshot,
  context: MetricContext,
  criteria: Criterion[],
  ids: string[],
  result: ScoreResult,
  date = new Date(),
  options: ScoringOptions = {},
) {
  const version = options.algorithmVersion ?? algorithmVersion
  const isV2 = version === algorithmVersionV2
  const sector = options.sector ?? defaultSectorId
  const sectorPreset = getSectorPreset(sector)
  return {
    algorithmVersion: version,
    normalizationScope: isV2 ? options.normalizationScope ?? 'candidates' : null,
    constraints: isV2 ? options.constraints ?? [] : [],
    exportedAt: date.toISOString(),
    preset: options.preset ?? preset,
    sector,
    sectorName: options.sectorName ?? sectorPreset?.id ?? sector,
    datasetVersion: snapshot.manifest.datasetVersion, boundaryVersion: snapshot.manifest.boundaryVersion,
    isDemo: snapshot.manifest.isDemo, context,
    criteria: isV2 ? criteria.map(criterion => ({ ...criterion, required: false })) : criteria,
    candidateIds: ids,
    sources: snapshot.manifest.sources, rows: result.rows,
  }
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return ''
  if (typeof value !== 'string') return String(value)
  // Quoting escapes CSV syntax; a leading apostrophe neutralizes spreadsheet formulas in text.
  const first = value.trimStart()[0]
  const startsWithControl = value.length > 0 && value.charCodeAt(0) < 32
  const safe = startsWithControl || (first && '=+@-'.includes(first)) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function reportToCsv(report: ReturnType<typeof createReport>): string {
  const header = [
    'algorithmVersion', 'normalizationScope', 'hardConstraints', 'exportedAt', 'preset', 'sector', 'sectorName', 'datasetVersion', 'boundaryVersion',
    'isDemo', 'period', 'segment', 'study',
    'geoId', 'adminCode', 'area', 'level', 'status', 'rank', 'score', 'exclusionReasons', 'criterionCode',
    'criterionName', 'required', 'direction', 'weightPct', 'rawValue', 'unit', 'sourceId', 'sourceLabel', 'sourceLocator',
    'measurementPeriod', 'measurementStatus', 'missingReason', 'n', 'method', 'min', 'max', 'normalized', 'contribution', 'pointsLost',
  ]
  const lines = report.rows.flatMap((row) => row.breakdown.map((item) => {
    const { metric, criterion } = item
    const source = metric.sourceId ? report.sources[metric.sourceId] : undefined
    return [
      report.algorithmVersion, report.normalizationScope, JSON.stringify(report.constraints), report.exportedAt, report.preset,
      report.sector, report.sectorName, report.datasetVersion, report.boundaryVersion,
      report.isDemo, report.context.period, report.context.segment, report.context.study, row.area.id, row.area.code,
      row.area.name, row.area.level, row.status, row.rank, row.score, row.reasons.join(' | '), criterion.code, item.name,
      criterion.required, criterion.direction, criterion.weight, typeof metric.value === 'number' ? metric.value : null,
      metric.unit, metric.sourceId, source?.label ?? null, source?.locator ?? null, metric.period, metric.status, metric.reason,
      metric.n, metric.method, item.min, item.max, item.normalized, item.contribution, item.pointsLost,
    ]
  }))
  return '\uFEFF' + [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function downloadReport(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  downloadObjectUrl(name, url)
}

function downloadObjectUrl(name: string, url: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type SpreadsheetCell = string | number | boolean | null
export type SpreadsheetSheets = Record<string, SpreadsheetCell[][]>

export function reportToSpreadsheet(report: ReturnType<typeof createReport>): SpreadsheetSheets {
  const ranking: SpreadsheetCell[][] = [
    ['Hạng', 'Mã địa bàn', 'Địa bàn', 'Cấp', 'Trạng thái', 'Điểm', 'Lý do', 'Ngành', 'Tên ngành'],
    ...report.rows.map((row) => [
      row.rank, row.area.code, row.area.name, row.area.level, row.status, row.score, row.reasons.join(' · '),
      report.sector, report.sectorName,
    ]),
  ]
  const criteria: SpreadsheetCell[][] = [
    [
      'Hạng', 'Mã địa bàn', 'Địa bàn', 'Mã tiêu chí', 'Tiêu chí', 'Chiều tác động', 'Trọng số (%)',
      'Giá trị gốc', 'Đơn vị', 'Min', 'Max', 'Chuẩn hóa', 'Đóng góp', 'Điểm mất',
      'Trạng thái dữ liệu', 'Nguồn', 'Kỳ đo', 'Cỡ mẫu (n)', 'Phương pháp',
    ],
    ...report.rows.flatMap((row) => row.breakdown.map((item) => {
      const source = item.metric.sourceId ? report.sources[item.metric.sourceId] : undefined
      return [
        row.rank, row.area.code, row.area.name, item.criterion.code, item.name,
        item.criterion.direction, item.criterion.weight,
        typeof item.metric.value === 'number' ? item.metric.value : null, item.metric.unit,
        item.min, item.max, item.normalized, item.contribution, item.pointsLost,
        item.metric.status, source?.label ?? null, item.metric.period, item.metric.n, item.metric.method,
      ]
    })),
  ]
  const sources: SpreadsheetCell[][] = [
    ['Mã nguồn', 'Nguồn dữ liệu', 'Đường dẫn'],
    ...Object.entries(report.sources).sort(([a], [b]) => a.localeCompare(b))
      .map(([sourceId, source]) => [sourceId, source.label, source.locator]),
  ]
  return { 'Xếp hạng': ranking, 'Chi tiết tiêu chí': criteria, 'Nguồn': sources }
}

function escapeXml(value: string) {
  const validXmlText = Array.from(value).filter((character) => {
    const point = character.codePointAt(0) ?? 0
    return point === 9 || point === 10 || point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) ||
      (point >= 0xe000 && point <= 0xfffd) ||
      (point >= 0x10000 && point <= 0x10ffff)
  }).join('')
  return validXmlText
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function columnName(index: number) {
  let number = index + 1
  let result = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    number = Math.floor((number - 1) / 26)
  }
  return result
}

function worksheetCell(reference: string, value: SpreadsheetCell) {
  if (value === null) return `<c r="${reference}"/>`
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Giá trị XLSX không hữu hạn tại ${reference}.`)
    return `<c r="${reference}"><v>${value}</v></c>`
  }
  if (typeof value === 'boolean') return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

export function spreadsheetSheetXml(rows: readonly (readonly SpreadsheetCell[])[]) {
  const rowXml = rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) =>
      worksheetCell(`${columnName(columnIndex)}${rowIndex + 1}`, value),
    ).join('')}</row>`,
  ).join('')
  const maxColumns = Math.max(1, ...rows.map((row) => row.length))
  const finalColumn = columnName(maxColumns - 1)
  const finalRow = Math.max(1, rows.length)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${finalColumn}${finalRow}"/>` +
    `<sheetData>${rowXml}</sheetData></worksheet>`
}

export async function buildXlsxBytes(sheets: SpreadsheetSheets): Promise<Uint8Array> {
  const { strToU8, zipSync } = await import('fflate')
  const names = Object.keys(sheets)
  const sheetOverrides = names.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('')
  const sheetLinks = names.map((name, index) =>
    `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join('')
  const sheetRelationships = names.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('')
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `${sheetOverrides}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetLinks}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `${sheetRelationships}</Relationships>`,
    ),
  }
  names.forEach((name, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(spreadsheetSheetXml(sheets[name]))
  })
  return zipSync(files, { level: 6 })
}

export async function downloadReportAsXlsx(report: ReturnType<typeof createReport>, filename = 'xep-hang-dia-ban.xlsx') {
  const archive = await buildXlsxBytes(reportToSpreadsheet(report))
  const archiveBuffer = new ArrayBuffer(archive.byteLength)
  new Uint8Array(archiveBuffer).set(archive)
  const blob = new Blob([archiveBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  downloadObjectUrl(filename, url)
}
