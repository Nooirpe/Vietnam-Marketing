import { describe, expect, it } from 'vitest'
import type { GeometryCollection } from '../../src/types/snapshot'
import { findGeoIdAtPoint, parseCoordinatePair } from '../../src/domain/pointInPolygon'

const geometry: GeometryCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { geoId: 'ward-a' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
          [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { geoId: 'ward-b' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]],
          [[[40, 0], [50, 0], [50, 10], [40, 10], [40, 0]]],
        ],
      },
    },
  ],
}

describe('point-in-polygon lookup', () => {
  it('finds points in Polygon and MultiPolygon geometry, including outer boundaries', () => {
    expect(findGeoIdAtPoint(geometry, { latitude: 2, longitude: 2 })).toBe('ward-a')
    expect(findGeoIdAtPoint(geometry, { latitude: 0, longitude: 5 })).toBe('ward-a')
    expect(findGeoIdAtPoint(geometry, { latitude: 5, longitude: 25 })).toBe('ward-b')
    expect(findGeoIdAtPoint(geometry, { latitude: 5, longitude: 45 })).toBe('ward-b')
  })

  it('excludes holes and points outside loaded geometry', () => {
    expect(findGeoIdAtPoint(geometry, { latitude: 5, longitude: 5 })).toBeNull()
    expect(findGeoIdAtPoint(geometry, { latitude: 15, longitude: 15 })).toBeNull()
    expect(findGeoIdAtPoint(geometry, { latitude: 91, longitude: 0 })).toBeNull()
  })

  it('parses only valid latitude, longitude pairs', () => {
    expect(parseCoordinatePair('21.0285, 105.8542')).toEqual({ latitude: 21.0285, longitude: 105.8542 })
    expect(parseCoordinatePair('105.8542, 21.0285')).toBeNull()
    expect(parseCoordinatePair('21, 181')).toBeNull()
    expect(parseCoordinatePair('21, x')).toBeNull()
    expect(parseCoordinatePair('21')).toBeNull()
  })
})
