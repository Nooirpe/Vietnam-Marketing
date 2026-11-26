import type { GeoUnit, Indicator } from '../types/snapshot'
import { foldVietnamese } from '../utils/foldVietnamese'

const operators = ['gt', 'gte', 'lt', 'lte', 'eq', 'between'] as const
export type FilterOperator = typeof operators[number]
export type FilterLogic = 'all' | 'any'
export type SearchScope = 'auto' | 'province' | 'ward' | 'local'
export type ResultStatus = 'matched' | 'failed' | 'missing'

export interface FilterPredicate {
  code: string
  operator: FilterOperator
  threshold: number
  upperThreshold?: number
  negate?: boolean
}

export interface FilterPreset {
  id: string
  name: string
  logic: FilterLogic
  predicates: FilterPredicate[]
}

interface IndexedArea {
  area: GeoUnit
  parent: GeoUnit | undefined
  names: string[]
  address: string
}

export interface AreaFilterResult {
  area: GeoUnit
  parent: GeoUnit | undefined
  status: ResultStatus
  missing: number[]
}

export interface AreaFilterResults {
  rows: AreaFilterResult[]
  byGeoId: ReadonlyMap<string, AreaFilterResult>
  counts: Record<ResultStatus, number>
}

const compare: Record<Exclude<FilterOperator, 'between'>, (value: number, threshold: number) => boolean> = {
  gt: (value, threshold) => value > threshold,
  gte: (value, threshold) => value >= threshold,
  lt: (value, threshold) => value < threshold,
  lte: (value, threshold) => value <= threshold,
  eq: (value, threshold) => value === threshold,
}

export function isFilterOperator(value: unknown): value is FilterOperator {
  return operators.some(operator => operator === value)
}

export function isScalarIndicator(indicator: Indicator): boolean {
  return indicator.code !== 'wtp'
}

export function validThreshold(indicator: Indicator, threshold: number): boolean {
  return Number.isFinite(threshold)
    && threshold >= 0
    && (indicator.unit !== 'percent' || threshold <= 100)
    && (indicator.code !== 'population' || Number.isInteger(threshold))
}

export function validFilterPredicate(indicator: Indicator, predicate: FilterPredicate): boolean {
  if (!validThreshold(indicator, predicate.threshold)) return false
  if (predicate.operator === 'between') {
    return typeof predicate.upperThreshold === 'number'
      && validThreshold(indicator, predicate.upperThreshold)
      && predicate.threshold <= predicate.upperThreshold
  }
  return predicate.upperThreshold === undefined
}

export function createBuiltInFilterPresets(
  indicators: readonly Indicator[],
  valuesByCode: ReadonlyMap<string, readonly number[]>,
): FilterPreset[] {
  function median(code: string): number | undefined {
    const values = valuesByCode.get(code)?.filter(Number.isFinite).slice().sort((a, b) => a - b)
    if (!values?.length) return undefined
    const middle = Math.floor(values.length / 2)
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
  }

  const unmet = median('unmet')
  const opponents = median('poi_density')
  const spending = median('spending')
  const presets: FilterPreset[] = []
  if (unmet !== undefined && opponents !== undefined) {
    presets.push({
      id: 'builtin-demand-opportunity',
      name: 'Nhu cầu cao, đối thủ thấp',
      logic: 'all',
      predicates: [
        { code: 'unmet', operator: 'gte', threshold: unmet },
        { code: 'poi_density', operator: 'lte', threshold: opponents },
      ],
    })
  }
  if (spending !== undefined) {
    presets.push({
      id: 'builtin-high-spending',
      name: 'Sức mua cao',
      logic: 'all',
      predicates: [{ code: 'spending', operator: 'gte', threshold: spending }],
    })
  }
  const availableCodes = new Set(indicators.map(indicator => indicator.code))
  return presets.filter(preset => preset.predicates.every(predicate => {
    const indicator = indicators.find(item => item.code === predicate.code)
    return availableCodes.has(predicate.code) && !!indicator && validFilterPredicate(indicator, predicate)
  }))
}

export function parseFilterPresets(value: string, indicators: readonly Indicator[]): FilterPreset[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): FilterPreset[] => {
      if (!item || typeof item !== 'object') return []
      const preset = item as Record<string, unknown>
      if (typeof preset.id !== 'string' || typeof preset.name !== 'string' ||
          !preset.name.trim() || preset.name.length > 80 ||
          (preset.logic !== 'all' && preset.logic !== 'any') || !Array.isArray(preset.predicates)) return []
      const predicates = preset.predicates.flatMap((value): FilterPredicate[] => {
        if (!value || typeof value !== 'object') return []
        const candidate = value as Record<string, unknown>
        if (typeof candidate.code !== 'string' || typeof candidate.threshold !== 'number' ||
            !isFilterOperator(candidate.operator) ||
            (candidate.negate !== undefined && typeof candidate.negate !== 'boolean') ||
            (candidate.upperThreshold !== undefined && typeof candidate.upperThreshold !== 'number')) return []
        const predicate: FilterPredicate = {
          code: candidate.code,
          operator: candidate.operator,
          threshold: candidate.threshold,
          ...(candidate.upperThreshold === undefined ? {} : { upperThreshold: candidate.upperThreshold }),
          ...(candidate.negate === undefined ? {} : { negate: candidate.negate }),
        }
        const indicator = indicators.find(item => item.code === predicate.code)
        return indicator && validFilterPredicate(indicator, predicate) ? [predicate] : []
      })
      if (predicates.length !== preset.predicates.length) return []
      return [{ id: preset.id, name: preset.name.trim(), logic: preset.logic, predicates }]
    })
  } catch {
    return []
  }
}

export function indexAreas(areas: readonly GeoUnit[]): IndexedArea[] {
  const byId = new Map(areas.map(area => [area.id, area]))
  return areas.filter(area => area.level !== 'country').map(area => {
    const parent = area.parentId ? byId.get(area.parentId) : undefined
    const names = [area.name, ...area.aliases].map(foldVietnamese)
    // Administrative prefixes often aren't part of the user's typed name.
    names.push(...names.map(name => name.replace(/^(thanh pho|tinh|phuong|xa|dac khu)\s+/, '')))
    return {
      area,
      parent,
      names,
      address: [...names, ...(parent ? [parent.name, ...parent.aliases].map(foldVietnamese) : [])].join(' '),
    }
  })
}

export function includesAreaLevel(
  scope: SearchScope,
  provinceId: string | null,
  query: string,
  level: GeoUnit['level'],
): boolean {
  if (level === 'country') return false
  if (scope === 'province' || scope === 'ward') return level === scope
  if (scope === 'auto' && query) return true
  return level === (provinceId ? 'ward' : 'province')
}

function searchPriority(indexed: IndexedArea, query: string): number | null {
  if (!query) return 0
  if (indexed.area.code === query) return 0
  if (indexed.names.includes(query)) return 1
  if (indexed.names.some(name => name.startsWith(query))) return 2
  if (indexed.names.some(name => name.includes(query))) return 3
  if (query.split(' ').every(token => indexed.address.includes(token))) return 4
  return null
}

function evaluate(
  indexed: IndexedArea,
  predicates: readonly FilterPredicate[],
  logic: FilterLogic,
  getValue: (geoId: string, code: string) => unknown,
): AreaFilterResult {
  const missing: number[] = []
  const outcomes: (boolean | null)[] = []
  predicates.forEach(({ code, operator, threshold }, index) => {
    const value = getValue(indexed.area.id, code)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missing.push(index)
      outcomes.push(null)
    } else {
      const outcome = operator === 'between'
        ? value >= threshold && value <= (predicates[index].upperThreshold ?? Number.NaN)
        : compare[operator](value, threshold)
      outcomes.push(predicates[index].negate ? !outcome : outcome)
    }
  })
  const failed = logic === 'all' ? outcomes.includes(false) : outcomes.length > 0 && outcomes.every(value => value === false)
  const matched = logic === 'all'
    ? outcomes.every(value => value === true)
    : outcomes.includes(true)
  const status = predicates.length === 0 || matched ? 'matched' : failed ? 'failed' : 'missing'
  return { area: indexed.area, parent: indexed.parent, status, missing }
}

const names = new Intl.Collator('vi')

export function filterAreas(
  index: readonly IndexedArea[],
  options: {
    scope: SearchScope
    provinceId: string | null
    query: string
    predicates: readonly FilterPredicate[]
    logic?: FilterLogic
    getValue: (geoId: string, code: string) => unknown
  },
): AreaFilterResults {
  const { scope, provinceId, predicates, getValue } = options
  const logic = options.logic ?? 'all'
  // An active numeric filter uses one administrative level even during free-text search.
  const query = foldVietnamese(options.query)
  const scopeQuery = predicates.length ? '' : query
  const candidates = index.flatMap(indexed => {
    if (!includesAreaLevel(scope, provinceId, scopeQuery, indexed.area.level)) return []
    if ((scope === 'local' || (scope === 'auto' && !scopeQuery)) && provinceId && indexed.area.parentId !== provinceId) return []
    const priority = searchPriority(indexed, query)
    return priority === null ? [] : [{ indexed, priority }]
  })
  candidates.sort((left, right) =>
    left.priority - right.priority
      || names.compare(left.indexed.area.name, right.indexed.area.name)
      || left.indexed.area.id.localeCompare(right.indexed.area.id),
  )
  const counts: AreaFilterResults['counts'] = { matched: 0, failed: 0, missing: 0 }
  const rows = candidates.map(({ indexed }) => {
    const result = evaluate(indexed, predicates, logic, getValue)
    counts[result.status] += 1
    return result
  })
  return { rows, byGeoId: new Map(rows.map(row => [row.area.id, row])), counts }
}
