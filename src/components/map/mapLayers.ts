import type { GeometryCollection } from '../../types/snapshot'

export const mapLayers = [
  { code: 'population', label: 'Dân số' },
  { code: 'population_density', label: 'Mật độ dân số' },
  { code: 'spending', label: 'Chi tiêu bình quân' },
  { code: 'unmet', label: 'Nhu cầu chưa đáp ứng' },
  { code: 'poi_density', label: 'Mật độ đối thủ' },
  { code: 'off', label: 'Chỉ xem đường biên' },
] as const

export type LayerCode = (typeof mapLayers)[number]['code']
export type RegionFeature = GeometryCollection['features'][number]

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 8 })
const colors = ['#d1ebe6', '#8bc9bb', '#41998b', '#12625a']

export interface LegendBin {
  lower: number
  upper: number
  upperInclusive: boolean
  color: string
}

export function formatValue(value: number) {
  return numberFormat.format(value)
}

const displayUnits: Record<string, string> = {
  person: 'người',
  'person/km2': 'người/km²',
  'VND/person/month': 'đồng/người/tháng',
  'VND/quarter': 'đồng/quý',
  'store/km2': 'điểm bán/km²',
  percent: '%',
  'VND/delivery': 'đồng/lần giao',
}

export function formatUnit(unit: string | null) {
  return unit ? displayUnits[unit] ?? unit : ''
}

export function legendBins(layer: LayerCode, values: readonly number[]): LegendBin[] {
  if (layer === 'off' || values.length === 0) return []
  const [min, max] = layer === 'unmet' ? [0, 100] : values.reduce(
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

export function formatBin({ lower, upper, upperInclusive }: LegendBin) {
  if (lower === upper) return formatValue(lower)
  return `[${formatValue(lower)}, ${formatValue(upper)}${upperInclusive ? ']' : ')'}`
}
