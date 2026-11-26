import type { GeometryCollection } from '../types/snapshot'

interface Point {
  longitude: number
  latitude: number
}

function ringsFor(feature: GeometryCollection['features'][number]) {
  return feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat()
}

function xmlColor(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character] ?? character)
}

export function geometryMapSvg(
  geometry: GeometryCollection,
  fills: ReadonlyMap<string, string>,
  title: string,
) {
  const coordinates = geometry.features.flatMap((feature) => ringsFor(feature).flat())
  if (coordinates.length === 0) return null

  const bounds = coordinates.reduce((result, [longitude, latitude]) => ({
    minLongitude: Math.min(result.minLongitude, longitude),
    maxLongitude: Math.max(result.maxLongitude, longitude),
    minLatitude: Math.min(result.minLatitude, latitude),
    maxLatitude: Math.max(result.maxLatitude, latitude),
  }), {
    minLongitude: Infinity, maxLongitude: -Infinity,
    minLatitude: Infinity, maxLatitude: -Infinity,
  })
  const latitudeScale = Math.cos((bounds.minLatitude + bounds.maxLatitude) / 2 * Math.PI / 180)
  const minX = bounds.minLongitude * latitudeScale
  const maxX = bounds.maxLongitude * latitudeScale
  const minY = -bounds.maxLatitude
  const maxY = -bounds.minLatitude
  const width = 720
  const height = 300
  const padding = 12
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxX - minX, 1e-9),
    (height - padding * 2) / Math.max(maxY - minY, 1e-9),
  )
  const offsetX = (width - (maxX - minX) * scale) / 2
  const offsetY = (height - (maxY - minY) * scale) / 2
  const project = ({ longitude, latitude }: Point) => ({
    x: offsetX + (longitude * latitudeScale - minX) * scale,
    y: offsetY + (-latitude - minY) * scale,
  })

  const paths = geometry.features.map((feature) => {
    const path = ringsFor(feature).map((ring) => ring.map((point, index) => {
      const { x, y } = project({ longitude: point[0], latitude: point[1] })
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ') + ' Z').join(' ')
    const fill = xmlColor(fills.get(feature.properties.geoId) ?? '#cbd5e1')
    return `<path d="${path}" fill="${fill}" stroke="#475569" stroke-width="0.8" fill-rule="evenodd" vector-effect="non-scaling-stroke"/>`
  }).join('')
  const safeTitle = xmlColor(title)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeTitle}"><title>${safeTitle}</title><rect width="100%" height="100%" fill="#ffffff"/><g>${paths}</g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
