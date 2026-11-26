import { Plus, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Indicator } from '../../types/snapshot'
import { validFilterPredicate } from '../../domain/filterAreas'
import type { FilterLogic, FilterOperator, FilterPredicate } from '../../domain/filterAreas'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { useT } from '../../locales/useT'
import type { TranslationKey } from '../../locales/I18nContext'
import { formatUnit } from '../map/mapLayers'
import { indicatorLabel } from '../../locales/translate'

const operators: [FilterOperator, TranslationKey][] = [
  ['gt', 'search.operatorGt'], ['gte', 'search.operatorGte'], ['lt', 'search.operatorLt'],
  ['lte', 'search.operatorLte'], ['eq', 'search.operatorEq'], ['between', 'search.operatorRange'],
]

interface DraftPredicate extends Omit<FilterPredicate, 'threshold' | 'upperThreshold' | 'negate'> {
  id: number
  threshold: string
  upperThreshold: string
  negate: boolean
}

function toThreshold(text: string): number {
  const trimmed = text.trim()
  return /^\d+(?:[.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : NaN
}

export function PredicateEditor({ indicators, predicates, logic, onApply }: {
  indicators: readonly Indicator[]
  predicates: readonly FilterPredicate[]
  logic: FilterLogic
  onApply: (predicates: FilterPredicate[], logic: FilterLogic) => void
}) {
  const { language, t } = useT()
  const [drafts, setDrafts] = useState<DraftPredicate[]>(() => predicates.map((predicate, id) => ({
    ...predicate,
    id,
    threshold: String(predicate.threshold),
    upperThreshold: predicate.upperThreshold === undefined ? '' : String(predicate.upperThreshold),
    negate: predicate.negate ?? false,
  })))
  const [draftLogic, setDraftLogic] = useState<FilterLogic>(logic)
  const nextId = useRef(predicates.length)
  const idPrefix = useId()
  const [errors, setErrors] = useState<Record<number, string>>({})
  const labels = new Map(indicators.map(indicator => [indicator.code, indicator]))

  function addPredicate() {
    const code = indicators[0]?.code
    if (!code) return
    const id = nextId.current++
    setDrafts([...drafts, { id, code, operator: 'gt', threshold: '', upperThreshold: '', negate: false }])
  }

  function updatePredicate(id: number, update: Partial<Omit<DraftPredicate, 'id'>>) {
    setDrafts(drafts.map(draft => draft.id === id ? { ...draft, ...update } : draft))
    if (errors[id]) setErrors({ ...errors, [id]: '' })
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed: FilterPredicate[] = []
    const invalid: Record<number, string> = {}
    for (const { id, code, operator, threshold: text, upperThreshold: upperText, negate } of drafts) {
      const indicator = labels.get(code)
      const threshold = toThreshold(text)
      const upperThreshold = operator === 'between' ? toThreshold(upperText) : undefined
      const predicate: FilterPredicate = {
        code,
        operator,
        threshold,
        ...(upperThreshold === undefined ? {} : { upperThreshold }),
        ...(negate ? { negate: true } : {}),
      }
      if (!indicator || !validFilterPredicate(indicator, predicate)) {
        invalid[id] = indicator?.unit === 'percent'
          ? t('predicate.percentError')
          : indicator?.code === 'population'
            ? t('predicate.populationError')
            : operator === 'between' ? t('predicate.rangeError') : t('predicate.numberError')
      } else {
        parsed.push(predicate)
      }
    }
    setErrors(invalid)
    if (Object.keys(invalid).length === 0) onApply(parsed, draftLogic)
  }

  const control = 'min-w-0'

  return (
    <form noValidate onSubmit={apply} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-app-text">{t('search.conditions')}</h3>
        <Button
          type="button"
          onClick={addPredicate}
          disabled={indicators.length === 0}
          variant="ghost"
          className="!min-h-0 !px-1 !py-1 text-sm font-medium"
        >
          <Plus aria-hidden size={16} /> {t('search.addCondition')}
        </Button>
      </div>

      {drafts.length > 1 && (
        <label className="block text-sm font-medium text-app-text">
          {t('search.combine')}
          <Select aria-label={t('search.combineLabel')} className="mt-1"
            value={draftLogic} onChange={event => setDraftLogic(event.currentTarget.value === 'any' ? 'any' : 'all')}>
            <option value="all">{t('search.all')}</option>
            <option value="any">{t('search.any')}</option>
          </Select>
        </label>
      )}

      {drafts.map(({ id, code, operator, threshold, upperThreshold, negate }, index) => {
        const indicator = labels.get(code)
        const errorId = `${idPrefix}-predicate-error-${id}`
        return (
          <div key={id} className="space-y-2 rounded-control border border-app-border bg-app-surface-muted p-2">
            <div className="flex items-center gap-1">
              <Select
                aria-label={t('search.indicator', { index: index + 1 })}
                className={`${control} flex-1`}
                value={code}
                onChange={event => updatePredicate(id, { code: event.currentTarget.value })}
              >
                {indicators.map(item => <option value={item.code} key={item.code}>{indicatorLabel(item.code, item.name, t)}</option>)}
              </Select>
              <Button
                type="button"
                aria-label={t('search.removeDraft', { index: index + 1 })}
                variant="ghost"
                className="!min-h-0 shrink-0 !p-1.5"
                onClick={() => setDrafts(drafts.filter(draft => draft.id !== id))}
              >
                <Trash2 aria-hidden size={16} />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select
                aria-label={t('search.operator', { index: index + 1 })}
                className={`${control} !w-auto`}
                value={operator}
                onChange={event => updatePredicate(id, { operator: event.currentTarget.value as FilterOperator })}
              >
                {operators.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
              </Select>
              {operator === 'between' ? (
                <>
                  <input type="text" inputMode="decimal" aria-label={t('search.lowerBound', { index: index + 1 })}
                    aria-invalid={!!errors[id]} aria-describedby={errors[id] ? errorId : undefined}
                    className={`ui-control ${control}`} value={threshold}
                    onChange={event => updatePredicate(id, { threshold: event.currentTarget.value })} />
                  <span aria-hidden="true" className="text-app-text-muted">–</span>
                  <input type="text" inputMode="decimal" aria-label={t('search.upperBound', { index: index + 1 })}
                    aria-invalid={!!errors[id]} aria-describedby={errors[id] ? errorId : undefined}
                    className={`ui-control ${control}`} value={upperThreshold}
                    onChange={event => updatePredicate(id, { upperThreshold: event.currentTarget.value })} />
                </>
              ) : (
                <input type="text" inputMode="decimal" aria-label={t('search.threshold', { index: index + 1 })}
                  aria-invalid={!!errors[id]} aria-describedby={errors[id] ? errorId : undefined}
                  className={`ui-control ${control}`} value={threshold}
                  onChange={event => updatePredicate(id, { threshold: event.currentTarget.value })} />
              )}
              {indicator && <span className="shrink-0 text-xs text-app-text-muted">{formatUnit(indicator.unit, language)}</span>}
            </div>
            <label className="flex items-center gap-2 text-sm text-app-text">
              <input type="checkbox" checked={negate}
                onChange={event => updatePredicate(id, { negate: event.currentTarget.checked })} />
              {t('search.negate')}
            </label>
            {errors[id] && <p id={errorId} role="alert" className="text-xs text-red-700">{errors[id]}</p>}
          </div>
        )
      })}

      {(drafts.length > 0 || predicates.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="!px-3 !py-2">
            {t('search.apply')}
          </Button>
          {predicates.length > 0 && (
            <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1 text-sm underline" onClick={() => onApply([], 'all')}>
              {t('search.clearFilters')}
            </Button>
          )}
        </div>
      )}
    </form>
  )
}
