import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GeoUnit, Indicator } from '../../types/snapshot'
import {
  filterAreas,
  createBuiltInFilterPresets,
  includesAreaLevel,
  indexAreas,
  isFilterOperator,
  isScalarIndicator,
  validFilterPredicate,
} from '../../domain/filterAreas'
import type { FilterLogic, FilterPredicate, SearchScope } from '../../domain/filterAreas'
import { foldVietnamese } from '../../utils/foldVietnamese'

function parsePredicates(value: string, indicators: readonly Indicator[]): FilterPredicate[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): FilterPredicate[] => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Record<string, unknown>
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
      const indicator = indicators.find(indicator => indicator.code === predicate.code)
      return indicator && validFilterPredicate(indicator, predicate) ? [predicate] : []
    })
  } catch {
    return []
  }
}

function parseLogic(logic: string | null): FilterLogic {
  return logic === 'any' ? 'any' : 'all'
}

function parseScope(scope: string | null, provinceId: string | null): SearchScope {
  if (scope === 'province' || scope === 'ward') return scope
  return scope === 'local' && provinceId ? scope : 'auto'
}

export function useAreaSearch({
  areas,
  indicators,
  provinceId,
  getValue,
}: {
  areas: readonly GeoUnit[]
  indicators: readonly Indicator[]
  provinceId: string | null
  getValue: (geoId: string, code: string) => unknown
}) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const scope = parseScope(params.get('scope'), provinceId)
  const filters = params.get('filters') ?? ''
  const logic = parseLogic(params.get('logic'))
  const scalarIndicators = useMemo(() => indicators.filter(isScalarIndicator), [indicators])
  const predicates = useMemo(() => parsePredicates(filters, scalarIndicators), [filters, scalarIndicators])
  const index = useMemo(() => indexAreas(areas), [areas])
  const builtInPresets = useMemo(() => {
    const level = scope === 'province' ? 'province'
      : scope === 'ward' || scope === 'local' ? 'ward'
        : provinceId ? 'ward' : 'province'
    const presetAreas = areas.filter(area => area.level === level
      && (!(scope === 'local' || (scope === 'auto' && provinceId && level === 'ward')) || area.parentId === provinceId))
    const valuesByCode = new Map(scalarIndicators.map(indicator => [
      indicator.code,
      presetAreas.flatMap(area => {
        const value = getValue(area.id, indicator.code)
        return typeof value === 'number' && Number.isFinite(value) ? [value] : []
      }),
    ]))
    return createBuiltInFilterPresets(scalarIndicators, valuesByCode)
  }, [areas, scalarIndicators, scope, provinceId, getValue])
  const results = useMemo(() => filterAreas(index, { scope, provinceId, query, predicates, logic, getValue }),
    [index, scope, provinceId, query, predicates, logic, getValue])
  const foldedQuery = foldVietnamese(query)

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (next.toString() !== params.toString()) setParams(next, { preventScrollReset: true })
  }

  return {
    query,
    scope,
    logic,
    provinceId,
    predicates,
    indicators: scalarIndicators,
    builtInPresets,
    results,
    mapFilterActive: Boolean(foldedQuery || predicates.length),
    includesLevel: (level: GeoUnit['level']) => includesAreaLevel(scope, provinceId, predicates.length ? '' : foldedQuery, level),
    setQuery: (query: string) => setParam('q', query),
    setScope: (scope: SearchScope) => setParam('scope', scope === 'auto' ? '' : scope),
    setFilterGroup: (predicates: readonly FilterPredicate[], logic: FilterLogic) => {
      const next = new URLSearchParams(params)
      if (predicates.length) next.set('filters', JSON.stringify(predicates))
      else next.delete('filters')
      if (predicates.length && logic === 'any') next.set('logic', 'any')
      else next.delete('logic')
      if (next.toString() !== params.toString()) setParams(next, { preventScrollReset: true })
    },
  }
}

export type AreaSearchModel = ReturnType<typeof useAreaSearch>
