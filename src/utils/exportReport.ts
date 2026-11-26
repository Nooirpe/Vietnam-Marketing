import { algorithmVersion, preset, type Criterion, type ScoreResult } from '../domain/scoreCandidates'
import type { MetricContext, Snapshot } from '../types/snapshot'

export function createReport(snapshot: Snapshot, context: MetricContext, criteria: Criterion[], ids: string[], result: ScoreResult, date = new Date()) {
  return {
    algorithmVersion, exportedAt: date.toISOString(), preset, sector: 'grocery',
    datasetVersion: snapshot.manifest.datasetVersion, boundaryVersion: snapshot.manifest.boundaryVersion,
    isDemo: snapshot.manifest.isDemo, context, criteria, candidateIds: ids,
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
    'algorithmVersion', 'exportedAt', 'preset', 'sector', 'datasetVersion', 'boundaryVersion', 'isDemo', 'period', 'segment', 'study',
    'geoId', 'adminCode', 'area', 'level', 'status', 'rank', 'score', 'exclusionReasons', 'criterionCode',
    'criterionName', 'required', 'direction', 'weightPct', 'rawValue', 'unit', 'sourceId', 'sourceLabel', 'sourceLocator',
    'measurementPeriod', 'measurementStatus', 'missingReason', 'n', 'method', 'min', 'max', 'normalized', 'contribution', 'pointsLost',
  ]
  const lines = report.rows.flatMap((row) => row.breakdown.map((item) => {
    const { metric, criterion } = item
    const source = metric.sourceId ? report.sources[metric.sourceId] : undefined
    return [
      report.algorithmVersion, report.exportedAt, report.preset, report.sector, report.datasetVersion, report.boundaryVersion,
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
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
