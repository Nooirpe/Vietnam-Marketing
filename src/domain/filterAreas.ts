import type { GeoUnit, Indicator } from '../types/snapshot'
import { foldVietnamese } from '../utils/foldVietnamese'

const operators = ['gt', 'gte', 'lt', 'lte', 'eq'] as const
export type FilterOperator = typeof operators[number]
export type SearchScope = 'auto' | 'province' | 'ward' | 'local'
export type ResultStatus = 'matched' | 'failed' | 'missing'

export interface FilterPredicate {
  code: string
  operator: FilterOperator
  threshold: number
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

const compare: Record<FilterOperator, (value: number, threshold: number) => boolean> = {
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
  getValue: (geoId: string, code: string) => unknown,
): AreaFilterResult {
  const missing: number[] = []
  let failed = false
  predicates.forEach(({ code, operator, threshold }, index) => {
    const value = getValue(indexed.area.id, code)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missing.push(index)
    } else if (!compare[operator](value, threshold)) {
      failed = true
    }
  })
  // A known false condition determines the result even if another value is absent.
  return { area: indexed.area, parent: indexed.parent, status: failed ? 'failed' : missing.length ? 'missing' : 'matched', missing }
}

const names = new Intl.Collator('vi')

export function filterAreas(
  index: readonly IndexedArea[],
  options: {
    scope: SearchScope
    provinceId: string | null
    query: string
    predicates: readonly FilterPredicate[]
    getValue: (geoId: string, code: string) => unknown
  },
): AreaFilterResults {
  const { scope, provinceId, predicates, getValue } = options
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
    const result = evaluate(indexed, predicates, getValue)
    counts[result.status] += 1
    return result
  })
  return { rows, byGeoId: new Map(rows.map(row => [row.area.id, row])), counts }
}
