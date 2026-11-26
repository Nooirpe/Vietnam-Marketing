import { describe, expect, it } from 'vitest'
import { findBin, formatUnit, formatValue, legendBins } from '../../src/components/map/mapLayers'

describe('choropleth palettes', () => {
  it('formats numbers and units for the selected language', () => {
    expect(formatValue(1234.5, 'vi')).toBe('1.234,5')
    expect(formatValue(1234.5, 'en')).toBe('1,234.5')
    expect(formatUnit('VND/delivery', 'vi')).toBe('VND/lần giao')
    expect(formatUnit('VND/delivery', 'en')).toBe('VND/delivery')
  })

  it('uses sequential colorblind-friendly colors for population and spending', () => {
    const population = legendBins('population', [0, 100])
    const spending = legendBins('spending', [0, 100])
    expect(population.map(({ color }) => color)).toEqual(spending.map(({ color }) => color))
    expect(population[0]?.color).toBe('#ffffd9')
    expect(population.at(-1)?.color).toBe('#225ea8')
  })

  it('shows unmet need as an opportunity and high competitor density as a warning', () => {
    const unmet = legendBins('unmet', [0, 100])
    const competitors = legendBins('poi_density', [0, 100])
    expect(findBin(unmet, 0)?.color).toBe('#d73027')
    expect(findBin(unmet, 100)?.color).toBe('#1a9850')
    expect(findBin(competitors, 0)?.color).toBe('#1a9850')
    expect(findBin(competitors, 100)?.color).toBe('#d73027')
  })
})
