// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DecisionWorkbench } from '../../src/pages/DecisionWorkbench'
import { I18nProvider } from '../../src/locales/I18nProvider'
import { demoSnapshot } from './fixture'

describe('DecisionWorkbench industry presets', () => {
  it('loads the selected industry criteria and explains proxy indicators', () => {
    render(
      <MemoryRouter initialEntries={['/decision?snapshot=demo&areas=P01,P79']}>
        <I18nProvider>
          <Routes>
            <Route path="/decision" element={
              <DecisionWorkbench snapshot={demoSnapshot} loadGeometry={async () => null} />
            } />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Ngành'), { target: { value: 'coffee' } })
    expect(screen.getByText('Dùng chi tiêu và quy mô/mật độ dân số làm chỉ tiêu tham chiếu; chưa có dữ liệu chuyên biệt cho quán cà phê.')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Trọng số spending' })).toHaveValue(45)
    expect(screen.getByRole('spinbutton', { name: 'Trọng số population_density' })).toHaveValue(35)
    expect(screen.getByRole('spinbutton', { name: 'Trọng số population' })).toHaveValue(20)
  })
})
