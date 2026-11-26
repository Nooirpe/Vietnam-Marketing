import { ChevronRight, Layers3, MapPinOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AreaPopup } from '../components/map/AreaPopup'
import { Legend } from '../components/map/Legend'
import { MapCanvas } from '../components/map/MapCanvas'
import { findBin, legendBins, mapLayers, type LayerCode, type RegionFeature } from '../components/map/mapLayers'
import { SearchPanel } from '../components/search/SearchPanel'
import { useAreaSearch } from '../components/search/useAreaSearch'
import { resolveMetric } from '../domain/resolveMetric'
import type { GeometryCollection, MetricContext, Snapshot } from '../types/snapshot'

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

const actionClass = 'cursor-pointer rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold !text-white no-underline hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800'
const selectClass = 'block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700'

export function MapWorkspace({ snapshot, loadGeometry }: MapWorkspaceProps) {
  const [params, setParams] = useSearchParams()
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
  const layerLabel = mapLayers.find(option => option.code === layer)?.label ?? ''
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

  const [retry, setRetry] = useState(0)
  const [geometryResult, setGeometryResult] = useState<GeometryResult | null>(null)
  const scopeKey = `${snapshot.manifest.datasetVersion}:${snapshot.manifest.boundaryVersion}:${provinceId ?? 'VN'}`
  const geometryKey = `${scopeKey}:${retry}`
  const result = geometryResult?.key === geometryKey ? geometryResult : null
  const geometry = result?.state === 'ready' ? result.collection : null
  const hasSelectedGeometry = !!geometry?.features.some(feature => feature.properties.geoId === selectedAreaId)

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
      const value = getValue(unit.id, layer)
      results.set(unit.id, typeof value === 'number' ? value : null)
    }
    return results
  }, [snapshot.units, provinceId, layer, getValue])

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
      color: excluded ? '#94a3b8' : '#12423d',
      opacity: excluded ? 0.55 : 0.9,
      weight: selected ? 2.8 : 1.15,
      dashArray: excluded ? '4 5' : undefined,
      fill: layer !== 'off',
      fillColor: value === null ? hatch : findBin(bins, value)?.color,
      fillOpacity: excluded ? 0.55 : 0.9,
    }
  }

  const selectedMetric = selectedArea && layer !== 'off' ? getMetric(selectedArea.id, layer) : null
  const source = selectedMetric?.sourceId ? snapshot.manifest.sources[selectedMetric.sourceId] : undefined
  const geometrySource = snapshot.manifest.geometrySource
  const analysisParams = new URLSearchParams(params)
  analysisParams.set('period', period)
  if (segment) analysisParams.set('segment', segment)
  if (study) analysisParams.set('study', study)
  if (selectedAreaId && !analysisParams.has('areas')) analysisParams.set('areas', selectedAreaId)
  const profileLink = selectedArea && (
    <Link className={actionClass} to={{ pathname: `/area/${selectedArea.id}`, search: params.toString() }}>Xem hồ sơ địa bàn</Link>
  )
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
      bins={bins}
      onClose={() => changeParams({ area: null })}
      action={selectedArea.level === 'province'
        ? <div className="flex flex-wrap gap-2">
          <button className={actionClass} type="button" onClick={() => changeParams({ province: selectedArea.id, area: null })}>Xem cấp xã</button>
          {profileLink}
        </div>
        : profileLink}
    />
  )
  const hasMissing = layer !== 'off' && !!geometry?.features.some(feature => values.get(feature.properties.geoId) == null)
  const hasExcluded = !!geometry?.features.some(feature => isExcluded(feature.properties.geoId))

  return (
    <main className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Bản đồ thị trường Việt Nam</h1>
          <nav aria-label="Cấp hành chính" className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
            <button type="button" aria-current={!province ? 'page' : undefined}
              className="cursor-pointer rounded-sm font-medium text-teal-800 hover:underline"
              onClick={() => changeParams({ province: null, area: null })}>Việt Nam</button>
            {(province || selectedArea?.level === 'province') && (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <button type="button" className="cursor-pointer rounded-sm font-medium text-teal-800 hover:underline"
                  aria-current={province && !selectedArea ? 'page' : undefined}
                  onClick={() => changeParams({ province: province?.id ?? selectedArea?.id ?? null, area: null })}>
                  {province?.name ?? selectedArea?.name}
                </button>
              </>
            )}
            {selectedArea?.level === 'ward' && (
              <><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{selectedArea.name}</span></>
            )}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {snapshot.manifest.isDemo && <span className="rounded-full bg-amber-100 px-3 py-1.5 font-semibold text-amber-950">Dữ liệu mô phỏng</span>}
          <label className="flex items-center gap-2 font-semibold text-slate-700">
            Hình học
            <select aria-label="Hình học bản đồ" className={selectClass}
              value={snapshot.manifest.geometryMode} onChange={event => changeParams({
                snapshot: event.target.value === 'schematic' ? 'demo' : null,
              })}>
              <option value="boundary">Ranh giới hành chính</option>
              <option value="schematic">Ranh giới sơ đồ thử nghiệm</option>
            </select>
          </label>
        </div>
      </div>

      <nav aria-label="Công cụ phân tích" className="mb-4 flex flex-wrap gap-4 text-sm font-medium text-teal-800 underline">
        <Link to={{ pathname: '/compare', search: analysisParams.toString() }}>So sánh địa bàn</Link>
        <Link to={{ pathname: '/decision', search: analysisParams.toString() }}>Chấm điểm địa bàn</Link>
      </nav>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,370px)]">
        <section aria-labelledby="map-workspace-title" className="min-w-0 self-start overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
            <h2 id="map-workspace-title" className="sr-only">Điều khiển bản đồ</h2>
            <label className="min-w-40 flex-1 text-xs font-semibold text-slate-700">
              <span className="mb-1.5 flex items-center gap-1.5"><Layers3 size={14} aria-hidden="true" /> Lớp bản đồ</span>
              <select aria-label="Lớp bản đồ" value={layer} className={selectClass} onChange={event => changeParams({ layer: event.target.value })}>
                {mapLayers.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
            <label className="min-w-24 text-xs font-semibold text-slate-700">
              <span className="mb-1.5 block">Kỳ đo</span>
              <select value={period} className={selectClass} onChange={event => changeParams({ period: event.target.value })}>
                {periods.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
            {segments.length > 0 && (
              <label className="min-w-28 text-xs font-semibold text-slate-700">
                <span className="mb-1.5 block">Phân khúc khảo sát</span>
                <select value={segment} className={selectClass} onChange={event => changeParams({ segment: event.target.value })}>
                  {segments.map(option => <option key={option} value={option}>{option === 'urban_adults' ? 'Người trưởng thành ở đô thị' : option}</option>)}
                </select>
              </label>
            )}
            {studies.length > 1 && (
              <label className="min-w-28 text-xs font-semibold text-slate-700">
                <span className="mb-1.5 block">Bảng hỏi</span>
                <select value={study} className={selectClass} onChange={event => changeParams({ study: event.target.value })}>
                  {studies.map(option => <option key={option}>{option}</option>)}
                </select>
              </label>
            )}
          </div>
          {result === null && <p role="status" className="border-t border-slate-200 px-4 py-2 text-sm text-slate-600">Đang tải ranh giới…</p>}
          {result?.state === 'error' && (
            <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-red-100 px-4 py-2 text-sm text-red-800">
              <span>Không tải được ranh giới.</span>
              <button className="cursor-pointer font-semibold underline" type="button" onClick={() => setRetry(count => count + 1)}>Thử lại</button>
              <p className="w-full wrap-anywhere text-xs">{result.message}</p>
            </div>
          )}
          {result?.state === 'ready' && !geometry?.features.length && (
            <p role="status" className="flex items-center gap-2 border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
              <MapPinOff size={16} aria-hidden="true" />
              {provinceId ? 'Chưa có ranh giới cấp xã trong bản này' : 'Chưa có ranh giới cấp tỉnh trong bản này'}
            </p>
          )}
          <MapCanvas scopeKey={scopeKey} geometry={geometry} styleFeature={styleFeature}
            onSelect={selectMapFeature} selectedAreaId={selectedAreaId} popup={popup} />
          {popup && !hasSelectedGeometry && <div className="border-t border-slate-200 p-4">{popup}</div>}
          <Legend label={layerLabel} bins={bins} enabled={layer !== 'off'} hasMissing={hasMissing}
            hasExcluded={hasExcluded} unit={snapshot.indicators.find(indicator => indicator.code === layer)?.unit ?? null} />
          {provinceId && !!geometry?.features.length && geometrySource?.wardAttribution && (
            <p className="px-4 pb-3 text-xs text-slate-600 sm:px-5">
              <a className="underline" href={geometrySource.wardAttribution.locator} target="_blank" rel="noreferrer">
                {geometrySource.wardAttribution.label}
              </a>
            </p>
          )}
          {geometrySource && (
            <details className="border-t border-slate-200 px-4 py-3 text-xs text-slate-600 sm:px-5">
              <summary className="cursor-pointer">
                Ranh giới {snapshot.manifest.boundaryVersion} · {geometrySource.label}
              </summary>
              <p className="mt-2 wrap-anywhere">
                Nguồn {/^(https?):\/\//i.test(geometrySource.locator)
                  ? <a className="text-teal-800 underline" href={geometrySource.locator} target="_blank" rel="noreferrer">{geometrySource.locator}</a>
                  : geometrySource.locator}
              </p>
              <p className="mt-1">Giấy phép {geometrySource.license}</p>
              <p className="mt-1">{geometrySource.notes}</p>
            </details>
          )}
        </section>

        <SearchPanel model={search} selectedGeoId={selectedAreaId} onSelectArea={selectArea} />
      </div>
    </main>
  )
}
