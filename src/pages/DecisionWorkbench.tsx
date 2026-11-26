import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ContributionChart } from '../components/decision/ContributionChart'
import { PrintScoreReport } from '../components/decision/PrintScoreReport'
import { AreaSelect, ContextControls } from '../components/common/AnalysisControls'
import { PngExportButton } from '../components/common/PngExportButton'
import { useAnalysisContext } from '../components/common/useAnalysisContext'
import { SensitivityChart } from '../components/decision/SensitivityChart'
import { ScoreBreakdown } from '../components/decision/ScoreBreakdown'
import {
  algorithmVersion, algorithmVersionV2, defaultCriteria, scoreCandidates, scoreOpportunityAreas,
  type Criterion, type HardConstraint, type NormalizationScope, type ScoringAlgorithmVersion, type ScoringOptions, type ScoreResult,
} from '../domain/scoreCandidates'
import { defaultSectorId, getSectorPreset } from '../domain/presets'
import type { SectorId } from '../domain/presets'
import { isScalarIndicator, validThreshold } from '../domain/filterAreas'
import { analyzeSensitivity, type CriterionSensitivity } from '../domain/sensitivity'
import { applyWeightPreset, weightPresets, type WeightPresetId } from '../domain/scoringPresets'
import { resolveMetric } from '../domain/resolveMetric'
import type { GeometryCollection, Snapshot } from '../types/snapshot'
import { createReport, downloadReport, downloadReportAsXlsx, reportToCsv } from '../utils/exportReport'
import { findBin, legendBins, mapLayers, type LayerCode } from '../components/map/mapLayers'
import { geometryMapSvg } from '../utils/mapSnapshot'
import { elementToPngDataUrl } from '../utils/exportImage'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { Select } from '../components/ui/Select'
import { useT } from '../locales/useT'
import { indicatorLabel } from '../locales/translate'

type LoadGeometry = (snapshot: Snapshot, provinceId: string | null) => Promise<GeometryCollection | null>
type MapLoadState =
  | { key: string; status: 'ready'; geometry: GeometryCollection | null }
  | { key: string; status: 'error'; message: string }

export function DecisionWorkbench({ snapshot, loadGeometry }: { snapshot: Snapshot; loadGeometry: LoadGeometry }) {
  const { t } = useT()
  const { search } = useLocation()
  const state = useAnalysisContext(snapshot)
  const mapParams = useMemo(() => new URLSearchParams(search), [search])
  const scoreImport = useMemo(() => {
    const selected = Number(mapParams.get('score_selected'))
    const eligible = Number(mapParams.get('score_eligible'))
    const omitted = Number(mapParams.get('score_omitted'))
    return Number.isInteger(selected) && selected >= 2 && Number.isInteger(eligible) && eligible >= selected
      && Number.isInteger(omitted) && omitted === eligible - selected
      ? { selected, eligible, omitted }
      : null
  }, [mapParams])
  const mapPeriod = state.context.period
  const mapSegment = state.context.segment
  const mapStudy = state.context.study
  const mapContext = useMemo(() => ({
    period: mapPeriod,
    segment: mapSegment,
    study: mapStudy,
  }), [mapPeriod, mapSegment, mapStudy])
  const contributionTarget = useRef<HTMLDivElement>(null)
  const [criteria, setCriteria] = useState(defaultCriteria)
  const [sectorId, setSectorId] = useState<SectorId>(defaultSectorId)
  const [version, setVersion] = useState<ScoringAlgorithmVersion>(() =>
    mapParams.has('score_selected') ? algorithmVersionV2 : algorithmVersion)
  const [normalizationScope, setNormalizationScope] = useState<NormalizationScope>(() =>
    mapParams.has('score_selected') ? 'same-level' : 'candidates')
  const [constraints, setConstraints] = useState<HardConstraint[]>([])
  const [presetId, setPresetId] = useState<WeightPresetId | 'custom'>('demand')
  const [nextCode, setNextCode] = useState('')
  const [nextConstraintCode, setNextConstraintCode] = useState('')
  const [calculation, setCalculation] = useState<ScoreResult | null>(null)
  const [sensitivity, setSensitivity] = useState<CriterionSensitivity[] | null>(null)
  const [mapLoad, setMapLoad] = useState<MapLoadState | null>(null)
  const [exportError, setExportError] = useState('')
  const [isExportingXlsx, setIsExportingXlsx] = useState(false)
  const [printData, setPrintData] = useState<{
    report: ReturnType<typeof createReport>
    chartImage: string
    mapImage: string
    layerLabel: string
  } | null>(null)
  const scenario = JSON.stringify([
    state.ids, state.context, snapshot.manifest.datasetVersion, criteria, version, normalizationScope, constraints, presetId, sectorId,
  ])
  const [previousScenario, setPreviousScenario] = useState(scenario)
  if (scenario !== previousScenario) {
    setPreviousScenario(scenario)
    setCalculation(null)
    setSensitivity(null)
  }

  const areas = state.ids.map((id) => snapshot.unitsById.get(id))
  const candidateWardParents = [...new Set(areas.flatMap((area) =>
    area?.level === 'ward' && area.parentId ? [area.parentId] : [],
  ))]
  const requestedMapProvince = snapshot.unitsById.get(mapParams.get('province') ?? '')
  const mapProvinceId = candidateWardParents.length === 1
    ? candidateWardParents[0]
    : candidateWardParents.length === 0 && requestedMapProvince?.level === 'province'
      ? requestedMapProvince.id
      : null
  const mapLayer: LayerCode = mapLayers.find((item) => item.code === mapParams.get('layer'))?.code ?? 'population'
  const mapLayerLabel = t(mapLayers.find((item) => item.code === mapLayer)?.labelKey ?? 'map.layerPopulation')
  const [mapGeometryRevision, setMapGeometryRevision] = useState(0)
  const mapLoadKey = `${snapshot.manifest.datasetVersion}:${snapshot.manifest.boundaryVersion}:${mapProvinceId ?? 'VN'}:${mapGeometryRevision}`
  const currentMapLoad = useMemo(() => mapLoad?.key === mapLoadKey
    ? mapLoad
    : { key: mapLoadKey, status: 'loading' as const }, [mapLoad, mapLoadKey])
  const opportunityScores = useMemo(
    () => scoreOpportunityAreas(snapshot, snapshot.units.map(unit => unit.id), mapContext),
    [snapshot, mapContext],
  )
  useEffect(() => {
    let active = true
    loadGeometry(snapshot, mapProvinceId)
      .then((geometry) => geometry?.features.length || !mapProvinceId
        ? geometry
        : loadGeometry(snapshot, null))
      .then((geometry) => {
        if (active) setMapLoad({ key: mapLoadKey, status: 'ready', geometry })
      })
      .catch((error: unknown) => {
        if (active) setMapLoad({
          key: mapLoadKey,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => { active = false }
  }, [snapshot, mapProvinceId, loadGeometry, mapLoadKey])
  const mapImage = useMemo(() => {
    if (currentMapLoad.status !== 'ready' || !currentMapLoad.geometry?.features.length) return null
    const mapValue = (geoId: string) => mapLayer === 'opportunity'
      ? opportunityScores.get(geoId) ?? null
      : resolveMetric(snapshot, geoId, mapLayer, mapContext).value
    const values = mapLayer === 'off' ? [] : currentMapLoad.geometry.features.flatMap((feature) => {
      const value = mapValue(feature.properties.geoId)
      return typeof value === 'number' ? [value] : []
    })
    const bins = legendBins(mapLayer, values)
    const fills = new Map(currentMapLoad.geometry.features.map((feature) => {
      const value = mapLayer === 'off'
        ? null
        : mapValue(feature.properties.geoId)
      return [
        feature.properties.geoId,
        typeof value === 'number' ? findBin(bins, value)?.color ?? '#cbd5e1' : '#cbd5e1',
      ]
    }))
    return geometryMapSvg(currentMapLoad.geometry, fills, t('decision.mapDescription', {
      layer: mapLayerLabel, period: mapContext.period,
    }))
  }, [currentMapLoad, mapLayer, mapLayerLabel, mapContext, opportunityScores, snapshot, t])
  const validAreas = state.ids.length >= 2 && new Set(state.ids).size === state.ids.length &&
    areas.every((area) => area && area.level !== 'country' && area.level === areas[0]?.level)
  const validPeriod = Object.hasOwn(snapshot.manifest.periods, state.context.period)
  const total = criteria.reduce((sum, { weight }) => sum + weight, 0)
  const validWeights = total === 100 && criteria.every(({ weight }) => Number.isInteger(weight) && weight >= 0 && weight <= 100)
  const validConstraints = version !== algorithmVersionV2 || constraints.every(constraint => {
    const indicator = snapshot.indicatorsByCode.get(constraint.code)
    return indicator !== undefined && validThreshold(indicator, constraint.threshold)
  })
  const canCalculate = validAreas && validPeriod && validWeights && criteria.length <= 6 && validConstraints
  const canExport = canCalculate && calculation?.message === null
  const optional = snapshot.indicators.filter((item) => isScalarIndicator(item) && !criteria.some(({ code }) => code === item.code))
  const constraintOptions = snapshot.indicators.filter(item =>
    isScalarIndicator(item) && !constraints.some(({ code }) => code === item.code),
  )
  const sectorPreset = getSectorPreset(sectorId)!
  const weightPresetKey = presetId === 'balanced' ? 'decision.presetBalanced'
    : presetId === 'demand' ? 'decision.presetDemand'
      : presetId === 'competitors' ? 'decision.presetCompetitors'
        : presetId === 'spending' ? 'decision.presetSpending' : 'decision.custom'
  const scoringOptions: ScoringOptions = {
    algorithmVersion: version,
    normalizationScope,
    constraints: version === algorithmVersionV2 ? constraints : [],
    preset: version === algorithmVersionV2 ? t(weightPresetKey) : undefined,
    sector: sectorId,
    sectorName: t(sectorPreset.nameKey),
  }

  function select(index: number, id: string) {
    const next = [...state.ids]
    if (id) next[index] = id
    else next.splice(index, 1)
    state.setIds(next)
  }

  function clearResults() {
    setCalculation(null)
    setSensitivity(null)
  }

  function editCriteria(items: Criterion[]) {
    setCriteria(items)
    setPresetId('custom')
    clearResults()
  }

  function edit(index: number, update: Partial<Criterion>) {
    setCriteria(criteria.map((criterion, position) => position === index ? { ...criterion, ...update } : criterion))
    if (Object.hasOwn(update, 'weight')) setPresetId('custom')
    clearResults()
  }

  function editConstraint(index: number, update: Partial<HardConstraint>) {
    setConstraints(constraints.map((constraint, position) => position === index ? { ...constraint, ...update } : constraint))
    clearResults()
  }

  function exportFile(format: 'csv' | 'json') {
    if (!canExport || !calculation) return
    const report = createReport(snapshot, state.context, criteria, state.ids, calculation, new Date(), scoringOptions)
    const csv = format === 'csv'
    downloadReport(`xep-hang-dia-ban.${format}`, csv ? reportToCsv(report) : JSON.stringify(report, null, 2) + '\n',
      csv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8')
  }

  async function exportXlsx() {
    if (!canExport || !calculation) return
    setIsExportingXlsx(true)
    setExportError('')
    try {
      const report = createReport(snapshot, state.context, criteria, state.ids, calculation, new Date(), scoringOptions)
      await downloadReportAsXlsx(report)
    } catch (error) {
      setExportError(error instanceof Error ? t('decision.xlsxError', { message: error.message }) : t('decision.xlsxErrorFallback'))
    } finally {
      setIsExportingXlsx(false)
    }
  }

  async function printReport() {
    if (!canExport || !calculation || !mapImage) return
    const chart = contributionTarget.current
    if (!chart) {
      setExportError(t('decision.chartNotReady'))
      return
    }
    try {
      setExportError('')
      const chartImage = await elementToPngDataUrl(chart)
      setPrintData({
        report: createReport(snapshot, state.context, criteria, state.ids, calculation, new Date(), scoringOptions),
        chartImage,
        mapImage,
        layerLabel: mapLayerLabel,
      })
      window.setTimeout(() => window.print(), 120)
    } catch (error) {
      setExportError(error instanceof Error
        ? t('decision.exportError', { message: error.message })
        : t('decision.pdfErrorFallback'))
    }
  }

  return (
    <>
    <main className="no-print mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold">{t('decision.title')}</h1>
        <p className="mt-2 text-sm text-app-text-muted">{t(sectorPreset.nameKey)}{snapshot.manifest.isDemo && ` · ${t('app.demo')}`}</p>
      </header>
      <Panel className="space-y-2">
        <label className="grid max-w-md gap-1 text-sm">{t('decision.sector')}
          <Select value={sectorId} onChange={(event) => {
            const nextId = event.currentTarget.value as SectorId
            const nextPreset = getSectorPreset(nextId)
            if (!nextPreset) return
            setSectorId(nextId)
            setCriteria(nextPreset.criteria.map(criterion => ({ ...criterion })))
            setPresetId('custom')
            clearResults()
          }}>
            {getSectorPreset('grocery') && <option value="grocery">{t('sector.grocery')}</option>}
            {getSectorPreset('coffee') && <option value="coffee">{t('sector.coffee')}</option>}
            {getSectorPreset('pharmacy') && <option value="pharmacy">{t('sector.pharmacy')}</option>}
          </Select>
        </label>
        <p className="text-sm text-app-text-muted">{t(sectorPreset.descriptionKey)}</p>
        {sectorId !== defaultSectorId && <p className="text-xs text-app-text-muted">{t('decision.sectorDescription')}</p>}
      </Panel>
      {scoreImport && (
        <p role="status" className="rounded-control border border-brand-300 bg-brand-50 p-3 text-sm text-brand-950">
          {t('decision.importedCandidates', { selected: scoreImport.selected })}
          {scoreImport.omitted > 0
            ? ` ${t('decision.importTruncated', { omitted: scoreImport.omitted, eligible: scoreImport.eligible })}`
            : ` ${t('decision.importAll', { eligible: scoreImport.eligible })}`}
        </p>
      )}
      <ContextControls state={state} />
      {!validPeriod && <p role="alert">{t('decision.missingPeriod')}</p>}

      <Panel className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <label className="grid gap-1 text-sm">{t('decision.algorithm')}
          <Select value={version} onChange={(event) => {
            const nextVersion = event.target.value === algorithmVersionV2 ? algorithmVersionV2 : algorithmVersion
            setVersion(nextVersion)
            clearResults()
          }}>
            <option value={algorithmVersion}>{t('decision.algorithmV1')}</option>
            <option value={algorithmVersionV2}>{t('decision.algorithmV2')}</option>
          </Select>
        </label>
        {version === algorithmVersionV2 && (
          <label className="grid gap-1 text-sm">{t('decision.normalization')}
            <Select value={normalizationScope} onChange={(event) => {
              setNormalizationScope(event.target.value === 'same-level' ? 'same-level' : 'candidates')
              clearResults()
            }}>
              <option value="candidates">{t('decision.candidates')}</option>
              <option value="same-level">{t('decision.sameLevel')}</option>
            </Select>
          </label>
        )}
        <p className="text-sm text-app-text-muted sm:col-span-2">
          {version === algorithmVersionV2 && normalizationScope === 'same-level'
            ? t('decision.sameLevelNote')
            : version === algorithmVersionV2
              ? t('decision.candidateNote')
              : t('decision.legacyNote')}
        </p>
      </Panel>

      <Panel>
        <h2 className="mb-3 text-lg font-semibold">{t('decision.candidatesTitle')}</h2>
        <p className="mb-3 text-sm text-app-text-muted">{t('decision.minimumCandidates')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: Math.max(2, state.ids.length + 1) }, (_, index) => (
            <div key={index}>
              <AreaSelect snapshot={snapshot} label={t('decision.candidateLabel', { index: index + 1 })} value={state.ids[index] ?? ''}
                disabledIds={state.ids.filter((_, position) => position !== index)} onChange={(id) => select(index, id)} />
              {state.ids[index] && <Button variant="ghost" className="!min-h-0 !p-0 text-sm underline" onClick={() => select(index, '')}>{t('decision.removeCandidate', { index: index + 1 })}</Button>}
            </div>
          ))}
        </div>
        {areas.length >= 2 && !validAreas && <p role="alert" className="mt-3 text-sm text-amber-950">{t('decision.invalidCandidates')}</p>}
      </Panel>

      <Panel>
        <h2 className="mb-2 text-lg font-semibold">{t('decision.criteria')}</h2>
        <p className="mb-3 text-sm text-app-text-muted">
          {version === algorithmVersionV2
            ? t('decision.criteriaV2Help')
            : t('decision.criteriaLegacyHelp')}
        </p>
        <label className="mb-3 grid max-w-md gap-1 text-sm">{t('decision.weightPreset')}
          <Select value={presetId} onChange={(event) => {
            const selected = weightPresets.find(item => item.id === event.target.value)
            if (!selected) return
            setCriteria(applyWeightPreset(criteria, selected.id))
            setPresetId(selected.id)
            clearResults()
          }}>
            {weightPresets.map(item => {
              const labelKey = item.id === 'balanced' ? 'decision.presetBalanced'
                : item.id === 'demand' ? 'decision.presetDemand'
                  : item.id === 'competitors' ? 'decision.presetCompetitors' : 'decision.presetSpending'
              return <option key={item.id} value={item.id}
                disabled={item.priorityCode !== null && !criteria.some(criterion => criterion.code === item.priorityCode)}>
                {t(labelKey)}
              </option>
            })}
            <option value="custom">{t('decision.custom')}</option>
          </Select>
        </label>
        <div className="divide-y divide-slate-200">
          {criteria.map((criterion, index) => {
            const name = indicatorLabel(criterion.code, snapshot.indicatorsByCode.get(criterion.code)?.name ?? criterion.code, t)
            return (
              <div key={criterion.code} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6rem] sm:items-center">
                <div>
                  <p className="font-medium">{name}</p>
                  {version === algorithmVersion && criterion.required && (
                    <p className="text-sm text-app-text-muted">{t('decision.requiredV1', { direction: t(criterion.direction === 'benefit' ? 'decision.benefit' : 'decision.cost') })}</p>
                  )}
                  {(version === algorithmVersionV2 || !criterion.required) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Select aria-label={t('decision.direction', { code: criterion.code })} value={criterion.direction}
                        onChange={(event) => edit(index, { direction: event.target.value === 'cost' ? 'cost' : 'benefit' })}>
                        <option value="benefit">{t('decision.benefit')}</option>
                        <option value="cost">{t('decision.cost')}</option>
                      </Select>
                      <Button variant="ghost" className="text-sm underline"
                        onClick={() => editCriteria(criteria.filter((item) => item.code !== criterion.code))}>{t('decision.removeCriterion')}</Button>
                    </div>
                  )}
                </div>
                <input type="range" min="0" max="100" step="1" aria-label={t('decision.weightSlider', { code: criterion.code })}
                  value={Number.isFinite(criterion.weight) ? criterion.weight : 0}
                  onChange={(event) => edit(index, { weight: event.target.valueAsNumber })} className="w-full accent-teal-800" />
                <label className="text-sm">{t('decision.weight')}
                  <input type="number" min="0" max="100" step="1" inputMode="numeric"
                    aria-label={t('decision.weightFor', { code: criterion.code })} className="ui-control"
                    value={Number.isFinite(criterion.weight) ? criterion.weight : ''}
                    onChange={(event) => edit(index, { weight: event.target.valueAsNumber })} />
                </label>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-52 flex-1 text-sm">{t('decision.extraCriterion')}
            <Select value={nextCode} disabled={criteria.length >= 6} onChange={(event) => setNextCode(event.target.value)}>
              <option value="">{t('search.selectOption')}</option>
              {optional.map((item) => <option key={item.code} value={item.code}>{indicatorLabel(item.code, item.name, t)}</option>)}
            </Select>
          </label>
          <Button disabled={!nextCode || criteria.length >= 6} onClick={() => {
            editCriteria([...criteria, { code: nextCode, direction: 'benefit', weight: 0, required: false }])
            setNextCode('')
          }}>{t('decision.addCriterion')}</Button>
        </div>
        {criteria.length >= 6 && <p className="mt-2 text-sm text-app-text-muted">{t('decision.limitSix')}</p>}
        <p className="mt-4 text-sm font-medium" role="status">
          {Number.isFinite(total) ? t('decision.weightTotal', { total }) : t('decision.weightInvalid')}
          {Number.isFinite(total) && total !== 100 && ` · ${t(total < 100 ? 'decision.weightShortfall' : 'decision.weightExcess', { amount: Math.abs(100 - total) })}`}
          {!validWeights && ` · ${t('decision.weightInvalid')}`}
        </p>
      </Panel>

      {version === algorithmVersionV2 && (
        <Panel>
          <h2 className="mb-2 text-lg font-semibold">{t('decision.constraints')}</h2>
          <p className="mb-3 text-sm text-app-text-muted">
              {t('decision.constraintsHelp')}
          </p>
          {constraints.length > 0 && (
            <div className="divide-y divide-app-border">
              {constraints.map((constraint, index) => {
                const indicator = snapshot.indicatorsByCode.get(constraint.code)
                return (
                  <div key={constraint.code} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-end">
                    <p className="font-medium">{indicatorLabel(constraint.code, indicator?.name ?? constraint.code, t)}</p>
                    <label className="grid gap-1 text-sm">{t('decision.constraint')}
                      <Select aria-label={t('decision.constraintOperator', { code: constraint.code })} value={constraint.operator}
                        onChange={(event) => editConstraint(index, { operator: event.target.value === 'lte' ? 'lte' : 'gte' })}>
                        <option value="gte">{t('decision.minimum')}</option>
                        <option value="lte">{t('decision.maximum')}</option>
                      </Select>
                    </label>
                    <label className="grid gap-1 text-sm">{t('decision.threshold', { code: constraint.code })} {indicator?.unit ?? ''}
                      <input type="number" min="0" step="any" inputMode="decimal"
                        aria-label={t('decision.threshold', { code: constraint.code })} className="ui-control"
                        value={Number.isFinite(constraint.threshold) ? constraint.threshold : ''}
                        onChange={(event) => editConstraint(index, { threshold: event.target.valueAsNumber })} />
                    </label>
                    <Button variant="ghost" className="text-sm underline"
                      onClick={() => {
                        setConstraints(constraints.filter((_, position) => position !== index))
                        clearResults()
                      }}>{t('decision.removeCriterion')}</Button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-52 flex-1 text-sm">{t('decision.constraintIndicator')}
              <Select value={nextConstraintCode} onChange={(event) => setNextConstraintCode(event.target.value)}>
                <option value="">{t('search.selectOption')}</option>
                {constraintOptions.map(item => <option key={item.code} value={item.code}>{indicatorLabel(item.code, item.name, t)}</option>)}
              </Select>
            </label>
            <Button disabled={!nextConstraintCode} onClick={() => {
              const indicator = snapshot.indicatorsByCode.get(nextConstraintCode)
              if (!indicator || !isScalarIndicator(indicator)) return
              setConstraints([...constraints, {
                code: nextConstraintCode,
                operator: nextConstraintCode === 'poi_density' ? 'lte' : 'gte',
                threshold: Number.NaN,
              }])
              setNextConstraintCode('')
              clearResults()
            }}>{t('decision.addConstraint')}</Button>
          </div>
          {!validConstraints && <p role="alert" className="mt-3 text-sm text-red-700">{t('decision.constraintsInvalid')}</p>}
        </Panel>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={!canCalculate} onClick={() => {
          setCalculation(scoreCandidates(snapshot, state.ids, criteria, state.context, scoringOptions))
          setSensitivity(analyzeSensitivity(snapshot, state.ids, criteria, state.context, scoringOptions))
        }}>{t('decision.calculate')}</Button>
        <Button disabled={!canExport} onClick={() => exportFile('csv')}>{t('decision.downloadCsv')}</Button>
        <Button disabled={!canExport} onClick={() => exportFile('json')}>{t('decision.downloadJson')}</Button>
        <Button disabled={!canExport || isExportingXlsx} onClick={exportXlsx}>
          {isExportingXlsx ? t('decision.generatingXlsx') : t('decision.downloadXlsx')}
        </Button>
        <Button disabled={!canExport || !mapImage} onClick={printReport}>{t('decision.printPdf')}</Button>
      </div>
      {currentMapLoad.status === 'loading' && <p role="status" className="text-sm text-app-text-muted">{t('decision.reportMapLoading')}</p>}
      {currentMapLoad.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-status-fail">
          <span>{t('decision.reportMapFailed', { message: currentMapLoad.message })}</span>
          <Button type="button" variant="secondary" onClick={() => setMapGeometryRevision((revision) => revision + 1)}>{t('decision.retry')}</Button>
        </div>
      )}
      {currentMapLoad.status === 'ready' && !mapImage && (
        <p role="alert" className="text-sm text-status-fail">{t('decision.reportMapMissing')}</p>
      )}
      {exportError && <p role="alert" className="text-sm text-status-fail">{exportError}</p>}
      <p className="text-xs text-app-text-muted">{t('decision.reportCsvHint')}</p>
      <section className="space-y-3" aria-label={t('decision.results')}>
        <h2 className="text-lg font-semibold">{t('decision.results')}</h2>
        {!calculation && <p className="text-sm text-app-text-muted">{t('decision.runHint')}</p>}
        {calculation?.message && <p role="alert" className="rounded bg-amber-50 p-3">{calculation.message}</p>}
        {calculation?.message === null && (
          <>
            <div ref={contributionTarget}>
              <ContributionChart rows={calculation.rows} />
            </div>
            <PngExportButton target={() => contributionTarget.current} filename="dong-gop-tieu-chi" />
          </>
        )}
        {calculation?.rows.map((row) => <ScoreBreakdown key={row.area.id} row={row} snapshot={snapshot} />)}
      </section>
      {sensitivity && calculation?.message === null && (
        <SensitivityChart results={sensitivity} candidateCount={calculation.rows.length} />
      )}
    </main>
    {printData && <PrintScoreReport {...printData} />}
    </>
  )
}
