import { describe, expect, it } from 'vitest'
import { normalizeMinMax, normalizeMinMaxValues } from '../../src/domain/normalizeMinMax'

describe('Min–Max normalization', () => {
  it('uses the score candidate direction and flat-range behavior', () => {
    expect(normalizeMinMax(10, 0, 10, 'benefit')).toBe(100)
    expect(normalizeMinMax(10, 0, 10, 'cost')).toBe(0)
    expect(normalizeMinMax(5, 5, 5, 'benefit')).toBe(50)
  })

  it('normalizes available values and preserves missing values', () => {
    expect(normalizeMinMaxValues([10, null, 20], 'benefit')).toEqual([0, null, 100])
    expect(normalizeMinMaxValues([10, null, 20], 'cost')).toEqual([100, null, 0])
    expect(normalizeMinMaxValues([10, Infinity, 20], 'benefit')).toEqual([0, null, 100])
    expect(normalizeMinMaxValues([null, null], 'benefit')).toEqual([null, null])
    expect(normalizeMinMaxValues([7, 7], 'benefit')).toEqual([50, 50])
  })
})
