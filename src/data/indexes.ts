import type { GeoUnit, Indicator, Manifest, MarketObservation, Snapshot, SurveyEvidence } from '../types/snapshot'

export function dataKey(...parts: string[]): string {
  return JSON.stringify(parts)
}

function insert<T>(map: Map<string, T>, key: string, row: T, path: string): void {
  if (map.has(key)) throw new Error(`${path}: khóa trùng ${key}`)
  map.set(key, row)
}

export function indexSnapshot(
  manifest: Manifest, units: GeoUnit[], indicators: Indicator[],
  observations: MarketObservation[], evidence: SurveyEvidence[],
): Snapshot {
  const unitsById = new Map<string, GeoUnit>()
  const unitCodes = new Map<string, GeoUnit>()
  for (const [index, unit] of units.entries()) {
    const path = `${manifest.files.units}[${index}]`
    insert(unitsById, unit.id, unit, path)
    insert(unitCodes, dataKey(unit.level, unit.code), unit, path)
    const validCode = unit.level === 'country' ? unit.code === 'VN' && unit.id === 'VN' :
      (unit.level === 'province' ? /^\d{2}$/ : /^\d{5}$/).test(unit.code)
    if (!validCode) throw new Error(`${path}.code: mã hành chính không hợp lệ`)
  }
  if (!unitsById.has('VN') || unitsById.get('VN')?.level !== 'country') {
    throw new Error(`${manifest.files.units}: thiếu địa bàn quốc gia VN`)
  }
  for (const [index, unit] of units.entries()) {
    const parent = unit.parentId === null ? undefined : unitsById.get(unit.parentId)
    const valid = unit.level === 'country' ? unit.parentId === null :
      parent?.level === (unit.level === 'province' ? 'country' : 'province')
    if (!valid) throw new Error(`${manifest.files.units}[${index}].parentId: địa bàn cha sai cấp hoặc không tồn tại`)
  }
  for (const id of Object.keys(manifest.files.wardsByProvince ?? {})) {
    if (unitsById.get(id)?.level !== 'province') throw new Error(`manifest.json.files.wardsByProvince.${id}: mã tỉnh không hợp lệ`)
  }
  const indicatorsByCode = new Map<string, Indicator>()
  for (const [index, indicator] of indicators.entries()) {
    const path = `${manifest.files.dictionary}[${index}]`
    insert(indicatorsByCode, indicator.code, indicator, path)
    if (!Object.hasOwn(manifest.sources, indicator.sourceId)) throw new Error(`${path}.sourceId: nguồn chưa khai báo`)
  }
  function checkRow(row: MarketObservation | SurveyEvidence, path: string) {
    if (!unitsById.has(row.geoId)) throw new Error(`${path}.geoId: địa bàn chưa khai báo`)
    if (!Object.hasOwn(manifest.periods, row.period)) throw new Error(`${path}.period: kỳ chưa khai báo`)
    if (!Object.hasOwn(manifest.sources, row.sourceId)) throw new Error(`${path}.sourceId: nguồn chưa khai báo`)
  }
  const observationsByKey = new Map<string, MarketObservation>()
  for (const [index, row] of observations.entries()) {
    const path = `${manifest.files.observations}[${index}]`
    checkRow(row, path)
    for (const [code, value] of Object.entries(row.values)) {
      if (indicatorsByCode.get(code)?.kind !== 'market') throw new Error(`${path}.values.${code}: mã chỉ tiêu thị trường không hợp lệ`)
      if (value === null && !Object.hasOwn(row.missingReasons, code)) throw new Error(`${path}.missingReasons.${code}: cần lý do thiếu`)
      if (value !== null && (row.status === 'unavailable' || (code === 'population' && !Number.isInteger(value)))) {
        throw new Error(`${path}.values.${code}: giá trị không hợp lệ`)
      }
      insert(observationsByKey, dataKey(row.geoId, row.period, code), row, path)
    }
  }
  const evidenceByKey = new Map<string, SurveyEvidence>()
  for (const [index, row] of evidence.entries()) {
    const path = `${manifest.files.evidence}[${index}]`
    checkRow(row, path)
    for (const code of Object.keys(row.answers ?? {})) {
      if (indicatorsByCode.get(code)?.kind !== 'survey') throw new Error(`${path}.answers.${code}: mã chỉ tiêu khảo sát không hợp lệ`)
    }
    insert(evidenceByKey, dataKey(row.geoId, row.period, row.segment, row.study), row, path)
  }
  return { manifest, units, indicators, observations, evidence, unitsById, indicatorsByCode, observationsByKey, evidenceByKey }
}
