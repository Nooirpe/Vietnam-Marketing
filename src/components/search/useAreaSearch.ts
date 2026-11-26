import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GeoUnit, Indicator } from '../../types/snapshot'
import {
  filterAreas,
  includesAreaLevel,
  indexAreas,
  isFilterOperator,
  isScalarIndicator,
  validThreshold,
} from '../../domain/filterAreas'
import type { FilterPredicate, SearchScope } from '../../domain/filterAreas'
import { foldVietnamese } from '../../utils/foldVietnamese'

function parsePredicates(value: string, indicators: readonly Indicator[]): FilterPredicate[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is FilterPredicate => {
      if (!item || typeof item !== 'object' || typeof item.threshold !== 'number') return false
      const indicator = indicators.find(indicator => indicator.code === item.code)
      return !!indicator && isFilterOperator(item.operator) && validThreshold(indicator, item.threshold)
    })
  } catch {
    return []
  }
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
  const scalarIndicators = useMemo(() => indicators.filter(isScalarIndicator), [indicators])
  const predicates = useMemo(() => parsePredicates(filters, scalarIndicators), [filters, scalarIndicators])
  const index = useMemo(() => indexAreas(areas), [areas])
  const results = useMemo(() => filterAreas(index, { scope, provinceId, query, predicates, getValue }),
    [index, scope, provinceId, query, predicates, getValue])
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
    provinceId,
    predicates,
    indicators: scalarIndicators,
    results,
    mapFilterActive: Boolean(foldedQuery || predicates.length),
    includesLevel: (level: GeoUnit['level']) => includesAreaLevel(scope, provinceId, predicates.length ? '' : foldedQuery, level),
    setQuery: (query: string) => setParam('q', query),
    setScope: (scope: SearchScope) => setParam('scope', scope === 'auto' ? '' : scope),
    setPredicates: (predicates: readonly FilterPredicate[]) => setParam('filters', predicates.length ? JSON.stringify(predicates) : ''),
  }
}

export type AreaSearchModel = ReturnType<typeof useAreaSearch>
