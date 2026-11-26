import type { GeometryCollection } from '../../types/snapshot'
import type { Language } from '../../locales/I18nContext'

export const mapLayers = [
  { code: 'population', label: 'Dân số', labelKey: 'map.layerPopulation' },
  { code: 'population_density', label: 'Mật độ dân số', labelKey: 'map.layerDensity' },
  { code: 'spending', label: 'Chi tiêu bình quân', labelKey: 'map.layerSpending' },
  { code: 'unmet', label: 'Nhu cầu chưa đáp ứng', labelKey: 'map.layerUnmet' },
  { code: 'poi_density', label: 'Mật độ đối thủ', labelKey: 'map.layerCompetitors' },
  { code: 'opportunity', label: 'Điểm cơ hội', labelKey: 'map.layerOpportunity' },
  { code: 'off', label: 'Chỉ xem đường biên', labelKey: 'map.layerOff' },
] as const

export type LayerCode = (typeof mapLayers)[number]['code']
export type RegionFeature = GeometryCollection['features'][number]

const sequentialColors = ['#ffffd9', '#a1dab4', '#41b6c4', '#225ea8']
const unmetColors = ['#d73027', '#fee08b', '#91cf60', '#1a9850']
const competitorColors = ['#1a9850', '#91cf60', '#fee08b', '#d73027']

export interface LegendBin {
  lower: number
  upper: number
  upperInclusive: boolean
  color: string
}

export function formatValue(value: number, language: Language = 'vi') {
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 8 }).format(value)
}

const displayUnits: Record<string, readonly [string, string]> = {
  person: ['người', 'people'],
  'person/km2': ['người/km²', 'people/km²'],
  'VND/person/month': ['VND/người/tháng', 'VND/person/month'],
  'VND/quarter': ['VND/quý', 'VND/quarter'],
  'store/km2': ['điểm bán/km²', 'stores/km²'],
  percent: ['%', '%'],
  'VND/delivery': ['VND/lần giao', 'VND/delivery'],
  score: ['điểm', 'points'],
}

export function formatUnit(unit: string | null, language: Language = 'vi') {
  return unit ? displayUnits[unit]?.[language === 'en' ? 1 : 0] ?? unit : ''
}

export function legendBins(layer: LayerCode, values: readonly number[]): LegendBin[] {
  if (layer === 'off' || values.length === 0) return []
  const colors = layer === 'unmet'
    ? unmetColors
    : layer === 'poi_density' ? competitorColors : sequentialColors
  const [min, max] = layer === 'unmet' || layer === 'opportunity' ? [0, 100] : values.reduce(
    ([low, high], value) => [Math.min(low, value), Math.max(high, value)],
    [Infinity, -Infinity],
  )
  if (min === max) return [{ lower: min, upper: max, upperInclusive: true, color: colors[2] }]

  const step = (max - min) / colors.length
  return colors.map((color, index) => ({
    lower: min + step * index,
    upper: index === colors.length - 1 ? max : min + step * (index + 1),
    upperInclusive: index === colors.length - 1,
    color,
  }))
}

export function findBin(bins: readonly LegendBin[], value: number) {
  return bins.find(({ lower, upper, upperInclusive }) =>
    value >= lower && (upperInclusive ? value <= upper : value < upper),
  )
}

export function formatBin({ lower, upper, upperInclusive }: LegendBin, language: Language = 'vi') {
  if (lower === upper) return formatValue(lower, language)
  return `[${formatValue(lower, language)}, ${formatValue(upper, language)}${upperInclusive ? ']' : ')'}`
}
