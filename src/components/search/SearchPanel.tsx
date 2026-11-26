import { ChevronRight, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { GeoUnit } from '../../types/snapshot'
import { parseFilterPresets } from '../../domain/filterAreas'
import type { FilterPreset, ResultStatus, SearchScope } from '../../domain/filterAreas'
import { parseCoordinatePair } from '../../domain/pointInPolygon'
import type { GeographicPoint } from '../../domain/pointInPolygon'
import { PredicateEditor } from './PredicateEditor'
import type { AreaSearchModel } from './useAreaSearch'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Tabs } from '../ui/Tabs'
import { useT } from '../../locales/useT'
import { indicatorLabel } from '../../locales/translate'

const categories: ResultStatus[] = ['matched', 'failed', 'missing']
const categoryKeys = {
  matched: 'search.categoryMatched',
  failed: 'search.categoryFailed',
  missing: 'search.categoryMissing',
} as const

const pageSize = 24
const savedPresetsKey = 'vmi.saved-area-filters.v1'

interface ScoreActionResult {
  selectedCount: number
  eligibleCount: number
  omittedCount: number
  message: string
}

function readSavedPresets(indicators: AreaSearchModel['indicators']): { presets: FilterPreset[]; blocked: boolean } {
  try {
    const stored = localStorage.getItem(savedPresetsKey)
    return {
      presets: parseFilterPresets(stored ?? '[]', indicators).filter(preset => !preset.id.startsWith('builtin-')),
      blocked: false,
    }
  } catch {
    return { presets: [], blocked: true }
  }
}

function AreaResults({ model, selectedGeoId, onSelectArea, category, visibleCount, onShowMore, onRemovePredicate }: {
  model: AreaSearchModel
  selectedGeoId: string | null | undefined
  onSelectArea: (unit: GeoUnit) => void
  category: ResultStatus
  visibleCount: number
  onShowMore: () => void
  onRemovePredicate: (index: number) => void
}) {
  const { t } = useT()
  const visible = model.results.rows.filter(row => row.status === category).slice(0, visibleCount)
  const indicatorLabels = new Map(model.indicators.map(indicator => [
    indicator.code, indicatorLabel(indicator.code, indicator.name, t),
  ]))
  return (
    <>
      {visible.length === 0 ? (
        <p className="rounded-panel border border-app-border px-3 py-4 text-sm text-app-text-muted">
          {model.results.rows.length === 0 ? t('search.noAreas') : t('search.noCategory')}
        </p>
      ) : (
        <ul aria-label={t('search.results')} className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {visible.map(({ area, parent, missing }) => (
            <li key={area.id}>
              <Button
                type="button"
                aria-current={area.id === selectedGeoId || undefined}
                variant="ghost"
                className="!min-h-0 w-full justify-between !px-3 !py-3 text-left"
                onClick={() => onSelectArea(area)}
              >
                <span>
                  <span className="block font-medium text-app-text">{area.name}</span>
                  <span className="block text-xs leading-5 text-app-text-muted">
                    {area.level === 'ward' && parent ? `${parent.name} · ` : ''}{t('search.code', { code: area.code })}
                  </span>
                </span>
                <ChevronRight aria-hidden size={16} className="shrink-0 text-slate-500" />
              </Button>
              {missing.length > 0 && (
                <ul className="space-y-1 px-3 pb-3 text-xs text-app-text-muted">
                  {missing.map(index => (
                    <li key={index}>
                      {t('search.missing', { indicator: indicatorLabels.get(model.predicates[index].code) ?? model.predicates[index].code })}{' '}
                      <Button
                        type="button"
                        variant="ghost"
                        className="!min-h-0 !p-0 text-sm underline underline-offset-2"
                        onClick={() => onRemovePredicate(index)}
                      >
                        {t('search.removeCondition', { index: index + 1 })}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {model.results.counts[category] > visibleCount && (
        <Button type="button" variant="ghost" className="!min-h-0 !p-0 text-sm underline" onClick={onShowMore}>
          {t('search.showMore')}
        </Button>
      )}
    </>
  )
}

export function SearchPanel({
  model, selectedGeoId, onSelectArea, onScoreMatched, onStartPointSelection, onLocatePoint,
  canSelectPoint = false, pointMessage = '',
}: {
  model: AreaSearchModel
  selectedGeoId?: string | null
  onSelectArea: (unit: GeoUnit) => void
  onScoreMatched?: (limit: number) => ScoreActionResult
  onStartPointSelection?: () => void
  onLocatePoint?: (point: GeographicPoint) => void
  canSelectPoint?: boolean
  pointMessage?: string
}) {
  const { t } = useT()
  const [category, setCategory] = useState<ResultStatus>('matched')
  const [page, setPage] = useState({ key: '', count: pageSize })
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [coordinates, setCoordinates] = useState('')
  const [coordinateError, setCoordinateError] = useState('')
  const [presetName, setPresetName] = useState('')
  const [presetStatus, setPresetStatus] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetStore, setPresetStore] = useState(() => readSavedPresets(model.indicators))
  const [scoreLimit, setScoreLimit] = useState(10)
  const [scoreStatus, setScoreStatus] = useState('')
  const predicateKey = JSON.stringify([model.predicates, model.logic])
  const presets = useMemo(() => [...model.builtInPresets, ...presetStore.presets], [model.builtInPresets, presetStore.presets])
  const suggestions = model.query.trim() ? model.results.rows.slice(0, 6) : []
  const listKey = JSON.stringify([model.query, model.scope, model.provinceId, category, predicateKey])
  const visibleCount = page.key === listKey ? page.count : pageSize

  function applyPreset(id: string) {
    const preset = presets.find(item => item.id === id)
    setSelectedPresetId(preset?.id ?? '')
    if (preset) {
      model.setFilterGroup(preset.predicates, preset.logic)
      setCategory('matched')
    }
  }

  function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = presetName.trim()
    if (!name || model.predicates.length === 0) {
      setPresetStatus(t('search.presetRequired'))
      return
    }
    const next = [...presetStore.presets, {
      id: `saved-${Date.now()}`,
      name: name.slice(0, 80),
      logic: model.logic,
      predicates: model.predicates.map(predicate => ({ ...predicate })),
    }]
    setPresetStore({ presets: next, blocked: presetStore.blocked })
    setPresetName('')
    setSelectedPresetId(next[next.length - 1].id)
    try {
      localStorage.setItem(savedPresetsKey, JSON.stringify(next))
      setPresetStatus(t('search.presetSaved'))
    } catch {
      setPresetStore({ presets: next, blocked: true })
      setPresetStatus(t('search.presetStorageFailed'))
    }
  }

  function deleteSelectedPreset() {
    const next = presetStore.presets.filter(preset => preset.id !== selectedPresetId)
    setPresetStore({ presets: next, blocked: presetStore.blocked })
    setSelectedPresetId('')
    try {
      localStorage.setItem(savedPresetsKey, JSON.stringify(next))
      setPresetStatus(t('search.presetDeleted'))
    } catch {
      setPresetStore({ presets: next, blocked: true })
      setPresetStatus(t('search.presetDeleteFailed'))
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setShowSuggestions(false)
      setActiveSuggestion(-1)
    } else if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      setShowSuggestions(true)
      setActiveSuggestion(index => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault()
      setShowSuggestions(true)
      setActiveSuggestion(index => index <= 0 ? suggestions.length - 1 : index - 1)
    } else if (event.key === 'Enter' && suggestions.length > 0 && showSuggestions) {
      event.preventDefault()
      const row = suggestions[activeSuggestion < 0 ? 0 : activeSuggestion]
      if (row) {
        onSelectArea(row.area)
        setShowSuggestions(false)
      }
    }
  }

  function searchCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const point = parseCoordinatePair(coordinates)
    if (!point) {
      setCoordinateError(t('map.coordinatesInvalid'))
      return
    }
    setCoordinateError('')
    onLocatePoint?.(point)
  }

  function scoreMatched() {
    const result = onScoreMatched?.(scoreLimit)
    if (!result) return
    setScoreStatus(result.message || `${t('search.scoreSuccess', { selected: result.selectedCount })}${
      result.omittedCount ? ` ${t('search.scoreTruncated', { omitted: result.omittedCount, limit: scoreLimit })}` : ''
    }`)
  }

  return (
    <section aria-labelledby="area-search-title" className="min-w-0 space-y-4">
      <h2 id="area-search-title" className="text-lg font-semibold tracking-tight text-app-text">{t('map.searchTitle')}</h2>

      <div>
        <label htmlFor="area-search-query" className="block text-sm font-medium text-app-text">{t('map.searchArea')}</label>
        <div className="relative mt-1">
          <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-3 text-slate-500" />
          <input
            id="area-search-query"
            type="search"
            value={model.query}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-controls={showSuggestions && suggestions.length > 0 ? 'area-search-suggestions' : undefined}
            aria-activedescendant={activeSuggestion >= 0 && suggestions[activeSuggestion]
              ? `area-search-option-${suggestions[activeSuggestion].area.id}` : undefined}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => setShowSuggestions(Boolean(model.query.trim()))}
            onChange={event => {
              model.setQuery(event.currentTarget.value)
              setCategory('matched')
              setActiveSuggestion(-1)
              setShowSuggestions(true)
            }}
            placeholder={t('map.searchPlaceholder')}
            className="ui-control py-2 pl-9 pr-8 font-normal"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul id="area-search-suggestions" role="listbox" aria-label={t('search.suggestions')}
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-control border border-app-border bg-app-surface shadow-popover">
              {suggestions.map(({ area, parent }, index) => (
                <li key={area.id} id={`area-search-option-${area.id}`} role="option"
                  aria-selected={activeSuggestion === index} className={`cursor-pointer px-3 py-2 text-sm hover:bg-app-surface-muted ${
                    activeSuggestion === index ? 'bg-app-surface-muted' : ''
                  }`} onMouseDown={event => event.preventDefault()} onClick={() => {
                    onSelectArea(area)
                    setShowSuggestions(false)
                  }}>
                    <span className="block font-medium text-app-text">{area.name}</span>
                    <span className="block text-xs text-app-text-muted">
                      {area.level === 'ward' && parent ? `${parent.name} · ` : ''}{t('search.code', { code: area.code })}
                    </span>
                </li>
              ))}
            </ul>
          )}
          {model.query && (
            <Button
              type="button"
              aria-label={t('map.clearQuery')}
              onClick={() => { model.setQuery(''); setCategory('matched') }}
              variant="ghost"
              className="absolute right-1.5 top-1.5 !min-h-0 !p-1 text-app-text-muted hover:bg-app-surface-muted"
            >
              <X aria-hidden size={17} />
            </Button>
          )}
        </div>
      </div>

      <form className="space-y-2" onSubmit={searchCoordinates}>
        <label htmlFor="area-search-coordinates" className="block text-sm font-medium text-app-text">
        {t('map.coordinatesLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input id="area-search-coordinates" className="ui-control min-w-0 flex-1"
            value={coordinates} onChange={event => setCoordinates(event.currentTarget.value)}
            placeholder={t('map.coordinatesPlaceholder')} inputMode="decimal" />
          <Button type="submit" variant="secondary" disabled={!onLocatePoint}>{t('map.findCoordinates')}</Button>
        </div>
        {coordinateError && <p role="alert" className="text-xs text-status-fail">{coordinateError}</p>}
          <Button type="button" variant="ghost" className="!min-h-0 !px-1 !py-1 text-sm underline"
            disabled={!canSelectPoint} onClick={onStartPointSelection}>
            {t('map.selectPoint')}
        </Button>
        {pointMessage && <p role="status" className="text-xs text-app-text-muted">{pointMessage}</p>}
      </form>

      <label className="block text-sm font-medium text-app-text">
        {t('map.scope')}
        <Select
          value={model.scope}
          onChange={event => { model.setScope(event.currentTarget.value as SearchScope); setCategory('matched') }}
          className="mt-1 font-normal"
        >
          <option value="auto">{t('map.scopeAuto')}</option>
          <option value="province">{t('map.scopeProvince')}</option>
          <option value="ward">{t('map.scopeWard')}</option>
          {model.provinceId && <option value="local">{t('map.scopeLocal')}</option>}
        </Select>
      </label>

      <PredicateEditor
        key={predicateKey}
        indicators={model.indicators}
        predicates={model.predicates}
        logic={model.logic}
        onApply={(predicates, logic) => {
          model.setFilterGroup(predicates, logic)
          setSelectedPresetId('')
          setCategory('matched')
        }}
      />

      {model.predicates.length > 0 && (
        <p className="text-xs leading-relaxed text-app-text-muted">
          {model.logic === 'all' ? t('search.mustMeetAll') : t('search.meetAny')}
          {' '}{t('search.filterExplanation')}
          {' '}{t('search.allFailure')}
        </p>
      )}

      <div className="space-y-2 rounded-control border border-app-border p-3">
        <label className="block text-sm font-medium text-app-text">
          {t('search.filterPreset')}
          <Select aria-label={t('search.presetSelector')} value={selectedPresetId}
            className="mt-1" onChange={event => applyPreset(event.currentTarget.value)}>
            <option value="">{t('search.choosePreset')}</option>
            <optgroup label={t('search.builtInPresets')}>
              {model.builtInPresets.map(preset => <option key={preset.id} value={preset.id}>{t(
                preset.id === 'builtin-demand-opportunity' ? 'search.presetDemandHigh' : 'search.presetSpendingHigh',
              )}</option>)}
            </optgroup>
            {presetStore.presets.length > 0 && (
              <optgroup label={t('search.myPresets')}>
                {presetStore.presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </optgroup>
            )}
          </Select>
        </label>
        <form className="flex gap-2" onSubmit={savePreset}>
          <label htmlFor="filter-preset-name" className="sr-only">{t('search.presetName')}</label>
          <input id="filter-preset-name" className="ui-control min-w-0 flex-1" maxLength={80}
            value={presetName} onChange={event => setPresetName(event.currentTarget.value)}
            placeholder={t('search.presetPlaceholder')} />
          <Button type="submit" disabled={!model.predicates.length}>{t('search.savePreset')}</Button>
        </form>
        {presetStore.presets.some(preset => preset.id === selectedPresetId) && (
          <Button type="button" variant="ghost" className="!min-h-0 !px-1 !py-1 text-sm underline"
            onClick={deleteSelectedPreset}>{t('search.deletePreset')}</Button>
        )}
        {presetStore.blocked && <p className="text-xs text-app-text-muted">{t('search.presetStorageBlocked')}</p>}
        {presetStatus && <p role="status" className="text-xs text-app-text-muted">{presetStatus}</p>}
      </div>

      <p className="text-sm text-app-text-muted" role="status">{t('search.resultCount', { count: model.results.rows.length })}</p>
      <Tabs label={t('search.categoryTabs')} className="grid grid-cols-3 gap-1.5">
        {categories.map(status => (
          <Button
            type="button"
            key={status}
            aria-pressed={category === status}
            onClick={() => setCategory(status)}
            variant="ghost"
            className="ui-tab min-w-0 min-h-0 border border-app-border px-1.5 py-2 text-center text-xs aria-pressed:border-brand-700"
          >
            <span className="block font-semibold tabular-nums">{model.results.counts[status]}</span>
            {t(categoryKeys[status])}
          </Button>
        ))}
      </Tabs>

      {onScoreMatched && (
        <div className="space-y-2 rounded-control border border-app-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-app-text">
            {t('search.scoreLimit')}
            <Select aria-label={t('search.scoreLimitSelector')} className="w-auto"
              value={scoreLimit} onChange={event => setScoreLimit(Number(event.currentTarget.value))}>
              {[2, 3, 5, 10, 20].map(value => <option key={value} value={value}>{value}</option>)}
            </Select>
          </label>
          <Button type="button" variant="secondary" onClick={scoreMatched}>{t('search.scoreMatched')}</Button>
          <p className="text-xs text-app-text-muted">{t('search.scoreHelp')}</p>
          {scoreStatus && <p role="status" className="text-sm text-app-text-muted">{scoreStatus}</p>}
        </div>
      )}

      <AreaResults
        model={model}
        selectedGeoId={selectedGeoId}
        onSelectArea={onSelectArea}
        category={category}
        visibleCount={visibleCount}
        onShowMore={() => setPage({ key: listKey, count: visibleCount + pageSize })}
        onRemovePredicate={index => {
          model.setFilterGroup(model.predicates.filter((_, position) => position !== index), model.logic)
          setCategory('matched')
        }}
      />
    </section>
  )
}
