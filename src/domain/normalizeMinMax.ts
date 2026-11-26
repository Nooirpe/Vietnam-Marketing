export type NormalizationDirection = 'benefit' | 'cost'

export function normalizeMinMax(value: number, min: number, max: number, direction: NormalizationDirection) {
  if (max === min) return 50
  const distance = direction === 'benefit' ? value - min : max - value
  return 100 * (distance / (max - min))
}

export function normalizeMinMaxValues(
  values: readonly (number | null)[],
  direction: NormalizationDirection,
): (number | null)[] {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value))
  if (available.length === 0) return values.map(() => null)

  const min = Math.min(...available)
  const max = Math.max(...available)
  return values.map(value =>
    value === null || !Number.isFinite(value) ? null : normalizeMinMax(value, min, max, direction),
  )
}
