import type { GeometryCollection } from '../types/snapshot'

export interface GeographicPoint {
  latitude: number
  longitude: number
}

function onSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number): boolean {
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
  if (Math.abs(cross) > 1e-10) return false
  return x >= Math.min(x1, x2) - 1e-10 && x <= Math.max(x1, x2) + 1e-10
    && y >= Math.min(y1, y2) - 1e-10 && y <= Math.max(y1, y2) + 1e-10
}

function pointInRing(point: GeographicPoint, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false
  const x = point.longitude
  const y = point.latitude
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index++) {
    const [x1, y1] = ring[previous]
    const [x2, y2] = ring[index]
    if (onSegment(x, y, x1, y1, x2, y2)) return true
    const crosses = (y1 > y) !== (y2 > y)
    if (crosses && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

function pointInPolygon(point: GeographicPoint, rings: readonly (readonly (readonly [number, number])[])[]): boolean {
  const [outside, ...holes] = rings
  return !!outside && pointInRing(point, outside) && !holes.some(hole => pointInRing(point, hole))
}

export function findGeoIdAtPoint(
  geometry: GeometryCollection,
  point: GeographicPoint,
): string | null {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) return null
  for (const feature of geometry.features) {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
    if (polygons.some(polygon => pointInPolygon(point, polygon))) return feature.properties.geoId
  }
  return null
}

export function parseCoordinatePair(value: string): GeographicPoint | null {
  const parts = value.split(',').map(part => part.trim())
  if (parts.length !== 2 || parts.some(part => !/^-?\d+(?:\.\d+)?$/.test(part))) return null
  const [latitude, longitude] = parts.map(Number)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}
