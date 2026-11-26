const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

const units: Record<string, string> = {
  person: 'người', 'person/km2': 'người/km²', 'VND/person/month': 'VND/người/tháng',
  'VND/quarter': 'VND/quý', 'store/km2': 'điểm bán/km²', percent: '%', 'VND/delivery': 'VND/lần giao',
}

export const metricStatus = { verified: 'Đã xác minh', estimated: 'Ước tính', unavailable: 'Không có dữ liệu' }

export function formatMetricUnit(unit: string | null) {
  return unit ? units[unit] ?? unit : ''
}

export function formatNumber(value: number) {
  return formatter.format(value)
}
