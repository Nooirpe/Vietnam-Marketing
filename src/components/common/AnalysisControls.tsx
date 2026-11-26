import type { GeoUnit, Snapshot } from '../../types/snapshot'
import { surveyLabel, type AnalysisState } from './useAnalysisContext'
import { Panel } from '../ui/Panel'
import { Select } from '../ui/Select'
import { useT } from '../../locales/useT'

export function ContextControls({ state }: { state: AnalysisState }) {
  const { t } = useT()
  return (
    <Panel as="fieldset" className="grid gap-3 sm:grid-cols-3">
      <legend className="sr-only">{t('common.context')}</legend>
      {([
        ['period', 'common.periodOption', state.periods],
        ['segment', 'common.segmentOption', state.segments],
        ['study', 'common.studyOption', state.studies],
      ] as const).map(([key, label, options]) => (
        <label key={key} className="grid gap-1 text-sm font-medium">
          {t(label)}
          <Select value={state.context[key]} onChange={(event) => state.set(key, event.target.value)}>
            {!options.includes(state.context[key]) && (
              <option value={state.context[key]}>{state.context[key] || t('common.noChoice')}</option>
            )}
            {options.map((value) => <option key={value} value={value}>{value === 'urban_adults'
              ? t('common.survey.urban_adults')
              : value === 'grocery_delivery_v1' ? t('common.survey.grocery_delivery_v1') : surveyLabel(value)}</option>)}
          </Select>
        </label>
      ))}
    </Panel>
  )
}

function areaName(snapshot: Snapshot, area: GeoUnit) {
  const parent = area.parentId ? snapshot.unitsById.get(area.parentId) : undefined
  return [area.name, area.level === 'ward' ? parent?.name : undefined, area.code].filter(Boolean).join(' · ')
}

export function AreaSelect({ snapshot, value, label, onChange, disabledIds = [] }: {
  snapshot: Snapshot
  value: string
  label: string
  onChange: (value: string) => void
  disabledIds?: string[]
}) {
  const { t } = useT()
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('common.noAreaChoice')}</option>
        {value && !snapshot.unitsById.has(value) && <option value={value}>{t('common.unknownCode', { code: value })}</option>}
        {(['province', 'ward'] as const).map((level) => (
          <optgroup key={level} label={t(level === 'province' ? 'common.provinces' : 'common.wards')}>
            {snapshot.units.filter((area) => area.level === level).map((area) => (
              <option key={area.id} value={area.id} disabled={disabledIds.includes(area.id)}>{areaName(snapshot, area)}</option>
            ))}
          </optgroup>
        ))}
      </Select>
    </label>
  )
}
