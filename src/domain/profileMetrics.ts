import type { GeoUnit } from '../types/snapshot'

export function selectPeerUnits(units: readonly GeoUnit[], area: GeoUnit): GeoUnit[] {
  if (area.level === 'province') {
    return units.filter(unit => unit.level === 'province' && unit.id !== area.id)
  }
  if (area.level === 'ward' && area.parentId) {
    return units.filter(unit => unit.level === 'ward' && unit.parentId === area.parentId && unit.id !== area.id)
  }
  return []
}

export function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export type MedianDirection = 'above' | 'below' | 'equal' | 'unavailable'

export function compareWithMedian(value: number | null, reference: number | null): {
  direction: MedianDirection
  difference: number | null
} {
  if (value === null || reference === null || !Number.isFinite(value) || !Number.isFinite(reference)) {
    return { direction: 'unavailable', difference: null }
  }
  if (value === reference) return { direction: 'equal', difference: 0 }
  return value > reference
    ? { direction: 'above', difference: value - reference }
    : { direction: 'below', difference: value - reference }
}

export function rangePercentages(low: number, high: number, max: number) {
  const scale = max > 0 ? max : 1
  const start = Math.max(0, Math.min(100, low / scale * 100))
  const end = Math.max(start, Math.min(100, high / scale * 100))
  return { start, width: end - start }
}
