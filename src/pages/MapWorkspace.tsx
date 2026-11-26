import { ChevronRight, Layers3, MapPinOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspaceState } from '../app/useWorkspaceState'
import { PngExportButton } from '../components/common/PngExportButton'
import { AreaPopup } from '../components/map/AreaPopup'
import { Legend } from '../components/map/Legend'
import { MapCanvas } from '../components/map/MapCanvas'
import { MetricSparkline } from '../components/profile/MetricSparkline'
import { findBin, legendBins, mapLayers, type LayerCode, type RegionFeature } from '../components/map/mapLayers'
import { SearchPanel } from '../components/search/SearchPanel'
import { useAreaSearch } from '../components/search/useAreaSearch'
import { resolveMetric } from '../domain/resolveMetric'
import { findGeoIdAtPoint } from '../domain/pointInPolygon'
import type { GeographicPoint } from '../domain/pointInPolygon'
import { rankOpportunityAreas, scoreOpportunityAreas } from '../domain/scoreCandidates'
import type { GeometryCollection, MetricContext, Snapshot } from '../types/snapshot'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { Select } from '../components/ui/Select'
import { useT } from '../locales/useT'

type GeoUnit = Snapshot['units'][number]
type LoadGeometry = (snapshot: Snapshot, provinceId: string | null) => Promise<GeometryCollection | null>

interface MapWorkspaceProps {
  snapshot: Snapshot
  loadGeometry: LoadGeometry
}

type GeometryResult =
  | { key: string; state: 'ready'; collection: GeometryCollection | null }
  | { key: string; state: 'error'; message: string }

function readLayer(code: string | null): LayerCode {
  return mapLayers.find(layer => layer.code === code)?.code ?? 'population'
}

function chooseOption(requested: string | null, options: readonly string[]) {
  return requested && options.includes(requested) ? requested : options[0] ?? ''
}

export function MapWorkspace({ snapshot, loadGeometry }: MapWorkspaceProps) {
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const mapCaptureRef = useRef<HTMLDivElement>(null)
  const { isShortlisted, pin, unpin } = useWorkspaceState()
  const [searchSheetHeight, setSearchSheetHeight] = useState(76)
  const [selectingPoint, setSelectingPoint] = useState(false)
  const [pointMessage, setPointMessage] = useState('')
  const searchSheetDrag = useRef<{ startY: number; startHeight: number } | null>(null)
  const requestedProvince = snapshot.unitsById.get(params.get('province') ?? '')
  const province = requestedProvince?.level === 'province' ? requestedProvince : undefined
  const provinceId = province?.id ?? null
  const requestedArea = snapshot.unitsById.get(params.get('area') ?? '')
  const selectedArea = requestedArea && (
    provinceId
      ? requestedArea.level === 'ward' && requestedArea.parentId === provinceId
      : requestedArea.level === 'province'
  ) ? requestedArea : undefined
  const selectedAreaId = selectedArea?.id ?? null
  const layer = readLayer(params.get('layer'))
  const layerLabel = t(mapLayers.find(option => option.code === layer)?.labelKey ?? 'map.layerPopulation')
  const periods = useMemo(() => Object.keys(snapshot.manifest.periods).sort().reverse(), [snapshot])
  const segments = useMemo(() => [...new Set(snapshot.evidence.map(row => row.segment))].sort(), [snapshot])
  const studies = useMemo(() => [...new Set(snapshot.evidence.map(row => row.study))].sort(), [snapshot])
  const period = chooseOption(params.get('period'), periods)
  const segment = chooseOption(params.get('segment'), segments)
  const study = chooseOption(params.get('study'), studies)
  const context = useMemo<MetricContext>(() => ({ period, segment, study }), [period, segment, study])
  const getMetric = useCallback((id: string, code: string) => resolveMetric(snapshot, id, code, context), [snapshot, context])
  const getValue = useCallback((id: string, code: string) => getMetric(id, code).value, [getMetric])
  const search = useAreaSearch({ areas: snapshot.units, indicators: snapshot.indicators, provinceId, getValue })
  const opportunityScores = useMemo(
    () => scoreOpportunityAreas(snapshot, snapshot.units.map(unit => unit.id), context),
    [snapshot, context],
  )

  const [retry, setRetry] = useState(0)
  const [geometryResult, setGeometryResult] = useState<GeometryResult | null>(null)
  const scopeKey = `${snapshot.manifest.datasetVersion}:${snapshot.manifest.boundaryVersion}:${provinceId ?? 'VN'}`
  const geometryKey = `${scopeKey}:${retry}`
  const result = geometryResult?.key === geometryKey ? geometryResult : null
  const geometry = result?.state === 'ready' ? result.collection : null
  const hasSelectedGeometry = !!geometry?.features.some(feature => feature.properties.geoId === selectedAreaId)

  function startSearchSheetDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    searchSheetDrag.current = { startY: event.clientY, startHeight: searchSheetHeight }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveSearchSheet(event: PointerEvent<HTMLButtonElement>) {
    if (!searchSheetDrag.current) return
    const maxHeight = (event.currentTarget.ownerDocument.defaultView?.innerHeight ?? 800) * 0.75
    setSearchSheetHeight(Math.max(76, Math.min(maxHeight,
      searchSheetDrag.current.startHeight + searchSheetDrag.current.startY - event.clientY)))
  }

  function endSearchSheetDrag() {
    searchSheetDrag.current = null
  }

  function resizeSearchSheet(key: string) {
    if (key === 'ArrowUp') setSearchSheetHeight(height => Math.min(window.innerHeight * 0.75, height + 80))
    if (key === 'ArrowDown') setSearchSheetHeight(height => Math.max(76, height - 80))
  }

  useEffect(() => {
    let current = true
    loadGeometry(snapshot, provinceId)
      .then(collection => {
        if (current) setGeometryResult({ key: geometryKey, state: 'ready', collection })
      })
      .catch((error: unknown) => {
        if (current) setGeometryResult({
          key: geometryKey,
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => { current = false }
  }, [snapshot, provinceId, geometryKey, loadGeometry])

  const values = useMemo(() => {
    const results = new Map<string, number | null>()
    if (layer === 'off') return results
    for (const unit of snapshot.units) {
      const inScope = provinceId
        ? unit.level === 'ward' && unit.parentId === provinceId
        : unit.level === 'province'
      if (!inScope) continue
      const value = layer === 'opportunity' ? opportunityScores.get(unit.id) : getValue(unit.id, layer)
      results.set(unit.id, typeof value === 'number' ? value : null)
    }
    return results
  }, [snapshot.units, provinceId, layer, getValue, opportunityScores])

  const bins = useMemo(() => legendBins(layer, Array.from(values.values())
    .filter(value => value !== null)), [layer, values])

  function changeParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    if (next.toString() !== params.toString()) setParams(next, { preventScrollReset: true })
  }

  function selectArea(area: GeoUnit) {
    changeParams({ province: area.level === 'ward' ? area.parentId : null, area: area.id })
  }

  function selectMapFeature(id: string) {
    const unit = snapshot.unitsById.get(id)
    if (unit) selectArea(unit)
  }

  function locatePoint(point: GeographicPoint) {
    setSelectingPoint(false)
    if (!geometry) {
      setPointMessage(t('map.boundaryNotReady'))
      return
    }
    const geoId = findGeoIdAtPoint(geometry, point)
    const area = geoId ? snapshot.unitsById.get(geoId) : undefined
    if (!area) {
      setPointMessage(t('map.pointNotFound'))
      return
    }
    selectArea(area)
    const areaName = `${area.name}${area.level === 'ward' && area.parentId
      ? ` · ${snapshot.unitsById.get(area.parentId)?.name ?? ''}` : ''}`
    setPointMessage(t('map.pointFound', {
      area: areaName,
      latitude: point.latitude.toFixed(5),
      longitude: point.longitude.toFixed(5),
    }))
  }

  function scoreMatchedAreas(limit: number) {
    const matched = search.results.rows.filter(row => row.status === 'matched').map(row => row.area.id)
    const levels = new Set(matched.map(id => snapshot.unitsById.get(id)?.level).filter(Boolean))
    if (levels.size > 1) {
      return { selectedCount: 0, eligibleCount: 0, omittedCount: 0, message: t('search.scoreErrorLevel') }
    }
    const ranked = rankOpportunityAreas(opportunityScores, matched, limit)
    if (ranked.ids.length < 2) {
      return {
        selectedCount: ranked.ids.length,
        eligibleCount: ranked.eligibleCount,
        omittedCount: 0,
        message: t('search.scoreErrorFew'),
      }
    }
    const next = new URLSearchParams(params)
    next.set('areas', ranked.ids.join(','))
    next.set('score_selected', String(ranked.ids.length))
    next.set('score_eligible', String(ranked.eligibleCount))
    next.set('score_omitted', String(Math.max(0, ranked.eligibleCount - ranked.ids.length)))
    navigate({ pathname: '/decision', search: next.toString() })
    return {
      selectedCount: ranked.ids.length,
      eligibleCount: ranked.eligibleCount,
      omittedCount: Math.max(0, ranked.eligibleCount - ranked.ids.length),
      message: '',
    }
  }

  function isExcluded(id: string) {
    const unit = snapshot.unitsById.get(id)
    return !!(unit && search.mapFilterActive && search.includesLevel(unit.level)
      && search.results.byGeoId.get(id)?.status !== 'matched')
  }

  function styleFeature(feature: RegionFeature, hatch: string) {
    const id = feature.properties.geoId
    const value = values.get(id) ?? null
    const excluded = isExcluded(id)
    const selected = id === selectedAreaId
    return {
      color: excluded ? '#94a3b8' : 'var(--app-map-stroke)',
      opacity: excluded ? 0.55 : 0.9,
      weight: selected ? 2.8 : 1.15,
      dashArray: excluded ? '4 5' : undefined,
      fill: layer !== 'off',
      fillColor: value === null ? hatch : findBin(bins, value)?.color,
      fillOpacity: excluded ? 0.55 : 0.9,
    }
  }

  const opportunityValue = selectedArea ? opportunityScores.get(selectedArea.id) ?? null : null
  const selectedMetric = selectedArea && layer === 'opportunity'
    ? opportunityValue === null
      ? {
        value: null,
        unit: 'score',
        period,
        sourceId: null,
        n: null,
        method: null,
        status: 'unavailable' as const,
        reason: t('map.opportunityMissing'),
      }
      : {
        value: opportunityValue,
        unit: 'score',
        period,
        sourceId: null,
        n: null,
        method: null,
        status: 'estimated' as const,
        reason: null,
      }
    : selectedArea && layer !== 'off' ? getMetric(selectedArea.id, layer) : null
  const source = selectedMetric?.sourceId ? snapshot.manifest.sources[selectedMetric.sourceId] : undefined
  const geometrySource = snapshot.manifest.geometrySource
  const profileLink = selectedArea && (
    <Button as="link" to={{ pathname: `/area/${selectedArea.id}`, search: params.toString() }}>{t('profile.view')}</Button>
  )
  const shortlistAction = selectedArea && (
    <Button type="button" variant={isShortlisted(selectedArea.id) ? 'secondary' : 'primary'}
      onClick={() => isShortlisted(selectedArea.id) ? unpin(selectedArea.id) : pin(selectedArea.id)}>
      {isShortlisted(selectedArea.id) ? t('profile.unpin') : t('profile.pin')}
    </Button>
  )
  const trend = selectedArea && layer !== 'off' && layer !== 'opportunity' ? (
    <MetricSparkline snapshot={snapshot} geoId={selectedArea.id} code={layer} context={context} label={layerLabel} />
  ) : null
  const popup = selectedArea && (
    <AreaPopup
      area={selectedArea}
      isDemo={snapshot.manifest.isDemo}
      geometryMissing={result?.state === 'ready' && !hasSelectedGeometry}
      label={layerLabel}
      metric={selectedMetric}
      period={snapshot.manifest.periods[period]}
      source={source}
      surveySegment={layer === 'unmet' ? segment : undefined}
      trend={trend}
      shortlistAction={shortlistAction}
      bins={bins}
      onClose={() => changeParams({ area: null })}
      action={selectedArea.level === 'province'
        ? <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => changeParams({ province: selectedArea.id, area: null })}>{t('profile.drilldown')}</Button>
          {profileLink}
        </div>
        : profileLink}
    />
  )
  const hasMissing = layer !== 'off' && !!geometry?.features.some(feature => values.get(feature.properties.geoId) == null)
  const hasExcluded = !!geometry?.features.some(feature => isExcluded(feature.properties.geoId))

  return (
    <main className="map-workspace mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="map-workspace-header mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-app-text sm:text-3xl">{t('map.title')}</h1>
          <nav aria-label={t('map.adminBreadcrumb')} className="map-workspace-admin-breadcrumb mt-3 flex flex-wrap items-center gap-1.5 text-sm text-app-text">
            <Button variant="ghost" type="button" aria-current={!province ? 'page' : undefined}
            className="!min-h-0 !p-0 text-sm font-medium underline"
              onClick={() => changeParams({ province: null, area: null })}>{t('map.country')}</Button>
            {(province || selectedArea?.level === 'province') && (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <Button variant="ghost" type="button" className="!min-h-0 !p-0 text-sm font-medium underline"
                  aria-current={province && !selectedArea ? 'page' : undefined}
                  onClick={() => changeParams({ province: province?.id ?? selectedArea?.id ?? null, area: null })}>
                  {province?.name ?? selectedArea?.name}
                </Button>
              </>
            )}
            {selectedArea?.level === 'ward' && (
              <><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{selectedArea.name}</span></>
            )}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-2 font-semibold text-app-text">
              {t('map.boundaries')}
            <Select aria-label={t('map.geometryMode')}
              value={snapshot.manifest.geometryMode} onChange={event => changeParams({
                snapshot: event.target.value === 'schematic' ? 'demo' : null,
              })}>
              <option value="boundary">{t('map.boundaryAdmin')}</option>
              <option value="schematic">{t('map.boundarySchematic')}</option>
            </Select>
          </label>
        </div>
      </div>

      <div className="map-workspace-grid grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,370px)]">
        <Panel aria-labelledby="map-workspace-title" className="!p-0 map-workspace-map min-w-0 self-start overflow-hidden">
          <div className="map-workspace-controls flex flex-wrap items-end gap-3 p-4 sm:p-5">
            <h2 id="map-workspace-title" className="sr-only">{t('map.mapControls')}</h2>
            <label className="min-w-40 flex-1 text-xs font-semibold text-app-text">
              <span className="mb-1.5 flex items-center gap-1.5"><Layers3 size={14} aria-hidden="true" /> {t('map.layer')}</span>
              <Select aria-label={t('map.layerSelect')} value={layer} onChange={event => changeParams({ layer: event.target.value })}>
                {mapLayers.map(option => <option key={option.code} value={option.code}>{t(option.labelKey)}</option>)}
              </Select>
            </label>
            <label className="min-w-24 text-xs font-semibold text-app-text">
              <span className="mb-1.5 block">{t('map.period')}</span>
              <Select value={period} onChange={event => changeParams({ period: event.target.value })}>
                {periods.map(option => <option key={option}>{option}</option>)}
              </Select>
            </label>
            {segments.length > 0 && (
              <label className="min-w-28 text-xs font-semibold text-app-text">
                <span className="mb-1.5 block">{t('map.segment')}</span>
                <Select value={segment} onChange={event => changeParams({ segment: event.target.value })}>
                  {segments.map(option => <option key={option} value={option}>{option === 'urban_adults' ? t('common.survey.urban_adults') : option}</option>)}
                </Select>
              </label>
            )}
            {studies.length > 1 && (
              <label className="min-w-28 text-xs font-semibold text-app-text">
                <span className="mb-1.5 block">{t('map.study')}</span>
                <Select value={study} onChange={event => changeParams({ study: event.target.value })}>
                  {studies.map(option => <option key={option}>{option}</option>)}
                </Select>
              </label>
            )}
            <PngExportButton target={() => mapCaptureRef.current}
              filename={`ban-do-${snapshot.manifest.datasetVersion}-${period}`} label={t('map.exportPng')} />
          </div>
          {result === null && <p role="status" className="border-t border-app-border px-4 py-2 text-sm text-app-text-muted">{t('map.loadingBoundaries')}</p>}
          {result?.state === 'error' && (
            <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-red-100 px-4 py-2 text-sm text-red-800">
              <span>{t('map.boundaryLoadFailed')}</span>
              <Button variant="ghost" className="!min-h-0 !p-0 underline" type="button" onClick={() => setRetry(count => count + 1)}>{t('decision.retry')}</Button>
              <p className="w-full wrap-anywhere text-xs">{result.message}</p>
            </div>
          )}
          {result?.state === 'ready' && !geometry?.features.length && (
            <p role="status" className="flex items-center gap-2 border-t border-app-border px-4 py-2 text-sm text-app-text-muted">
              <MapPinOff size={16} aria-hidden="true" />
              {provinceId ? t('map.noWardBoundaries') : t('map.noProvinceBoundaries')}
            </p>
          )}
          {selectingPoint && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-300 bg-brand-50 px-4 py-2 text-sm text-brand-950">
              <span>{t('map.pointPrompt')}</span>
              <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1 text-sm underline"
                onClick={() => setSelectingPoint(false)}>{t('map.cancelPoint')}</Button>
            </div>
          )}
          <MapCanvas captureRef={mapCaptureRef} className="map-workspace-canvas" scopeKey={scopeKey} geometry={geometry} styleFeature={styleFeature}
            onSelect={selectMapFeature} selectedAreaId={selectedAreaId} popup={popup} selectingPoint={selectingPoint}
            onSelectPoint={(latitude, longitude) => locatePoint({ latitude, longitude })} />
          {popup && !hasSelectedGeometry && <div className="border-t border-slate-200 p-4">{popup}</div>}
          <Legend label={layerLabel} bins={bins} enabled={layer !== 'off'} hasMissing={hasMissing}
            hasExcluded={hasExcluded} unit={snapshot.indicators.find(indicator => indicator.code === layer)?.unit ?? null} />
          {provinceId && !!geometry?.features.length && geometrySource?.wardAttribution && (
            <p className="px-4 pb-3 text-xs text-app-text-muted sm:px-5">
              <a className="underline" href={geometrySource.wardAttribution.locator} target="_blank" rel="noreferrer">
                {geometrySource.wardAttribution.label}
              </a>
            </p>
          )}
          {geometrySource && (
            <details className="border-t border-app-border px-4 py-3 text-xs text-app-text-muted sm:px-5">
              <summary className="cursor-pointer">
                {t('map.boundaryDetails', { version: snapshot.manifest.boundaryVersion, source: geometrySource.label })}
              </summary>
              <p className="mt-2 wrap-anywhere">
                {t('map.sourceLabel', { source: '' }).trim()} {/^(https?):\/\//i.test(geometrySource.locator)
                  ? <a className="text-brand-700 underline" href={geometrySource.locator} target="_blank" rel="noreferrer">{geometrySource.locator}</a>
                  : geometrySource.locator}
              </p>
              <p className="mt-1">{t('map.license', { license: geometrySource.license })}</p>
              <p className="mt-1">{geometrySource.notes}</p>
            </details>
          )}
        </Panel>

        <Panel as="aside" aria-label={t('map.searchTitle')} className="map-search-sheet min-w-0"
          data-expanded={searchSheetHeight > 120}
          style={{ height: `${searchSheetHeight}px` }}>
          <button type="button" className="map-search-sheet-handle" aria-label={t('map.searchSheetHandle')}
            aria-expanded={searchSheetHeight > 120} onPointerDown={startSearchSheetDrag}
            onPointerMove={moveSearchSheet} onPointerUp={endSearchSheetDrag}
            onPointerCancel={endSearchSheetDrag}
            onKeyDown={event => {
              resizeSearchSheet(event.key)
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault()
            }}>
            <span aria-hidden="true" />
          </button>
          <div className="map-search-sheet-content">
            <SearchPanel model={search} selectedGeoId={selectedAreaId} onSelectArea={selectArea}
              onScoreMatched={scoreMatchedAreas} onStartPointSelection={() => {
                if (!geometry?.features.length) {
                  setPointMessage(t('map.boundaryNotReady'))
                  return
                }
                setSelectingPoint(true)
                setPointMessage('')
              }} onLocatePoint={locatePoint} canSelectPoint={!!geometry?.features.length}
              pointMessage={pointMessage} />
          </div>
        </Panel>
      </div>
    </main>
  )
}
