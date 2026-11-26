import { describe, expect, it } from 'vitest'
import { geometrySchema } from '../../src/data/schemas'
import { geometryMapSvg } from '../../src/utils/mapSnapshot'

describe('map snapshot export', () => {
  it('renders polygon geometry into a filled SVG data URL', () => {
    const geometry = geometrySchema.parse({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { geoId: 'P01' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[105, 20], [106, 20], [106, 21], [105, 20]]],
        },
      }],
    })
    const image = geometryMapSvg(geometry, new Map([['P01', '#00aa88']]), 'Bản đồ')
    expect(image).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(decodeURIComponent(image ?? '')).toContain('fill="#00aa88"')
    expect(geometryMapSvg({ type: 'FeatureCollection', features: [] }, new Map(), 'Empty')).toBeNull()
  })
})
