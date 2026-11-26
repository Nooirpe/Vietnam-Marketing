// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { resolveMetric } from '../../src/domain/resolveMetric'
import { I18nProvider } from '../../src/locales/I18nProvider'
import { LanguageToggle } from '../../src/components/ui/LanguageToggle'
import { SearchPanel } from '../../src/components/search/SearchPanel'
import { useAreaSearch } from '../../src/components/search/useAreaSearch'
import { demoSnapshot } from './fixture'

function SearchPanelHarness() {
  const context = {
    period: Object.keys(demoSnapshot.manifest.periods)[0],
    segment: '',
    study: '',
  }
  const model = useAreaSearch({
    areas: demoSnapshot.units,
    indicators: demoSnapshot.indicators,
    provinceId: null,
    getValue: (geoId, code) => resolveMetric(demoSnapshot, geoId, code, context).value,
  })
  return <SearchPanel model={model} onSelectArea={() => undefined} />
}

describe('SearchPanel localization', () => {
  it('switches its controls and filter editor to English', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <LanguageToggle />
          <SearchPanelHarness />
        </I18nProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Thêm điều kiện' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(localStorage.getItem('vmi.language')).toBe('en')
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
    expect(screen.getByRole('heading', { name: 'Filter conditions' })).toBeInTheDocument()
  })
})
