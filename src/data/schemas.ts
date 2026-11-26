import { z } from 'zod'

const text = z.string().trim().min(1)
const date = z.iso.date()
const safeFile = z.string().regex(/^[\w-]+(?:\/[\w-]+)*\.(?:json|geojson)$/)
const status = z.enum(['verified', 'estimated', 'unavailable'])
const available = z.enum(['verified', 'estimated'])
const ratio = z.number().min(0).max(100)
const nonnegative = z.number().nonnegative()

export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  datasetVersion: text,
  boundaryVersion: text,
  isDemo: z.boolean(),
  geometryMode: z.enum(['schematic', 'boundary']),
  geometrySource: z.object({
    label: text, locator: text, license: text, notes: text,
    wardAttribution: z.object({ label: text, locator: z.url({ protocol: /^https$/ }) }).optional(),
  }).optional(),
  periods: z.record(text, z.object({ start: date, end: date }).refine((p) => p.start <= p.end)),
  sources: z.record(text, z.object({ label: text, locator: text })),
  coverage: z.object({ provinceCount: z.int().nonnegative(), wardCount: z.int().nonnegative() }),
  files: z.object({
    units: safeFile, provinces: safeFile, wards: safeFile.optional(),
    wardsByProvince: z.record(text, safeFile).optional(),
    dictionary: safeFile, observations: safeFile, evidence: safeFile,
  }),
}).refine((m) => Object.keys(m.periods).length > 0, 'Cần ít nhất một kỳ đo')
  .refine((m) => m.geometryMode !== 'boundary' || m.geometrySource !== undefined, 'Cần khai báo nguồn ranh giới')
  .refine((m) => !(m.files.wards && m.files.wardsByProvince), 'Chọn một cách phân phối ranh giới cấp xã')

export const unitsSchema = z.array(z.object({
  id: text, name: text, code: text, level: z.enum(['country','province','ward']),
  parentId: text.nullable(), aliases: z.array(text),
}))

export const indicatorsSchema = z.array(z.object({
  code: text, name: text, unit: text, kind: z.enum(['market','survey']),
  periodType: z.literal('quarter'), sourceId: text, status,
}))

const measureKey = { geoId: text, period: text, sourceId: text }

export const observationsSchema = z.array(z.object({
  ...measureKey,
  status,
  values: z.record(text, nonnegative.nullable()),
  missingReasons: z.record(text, text),
}))

export const evidenceSchema = z.array(z.discriminatedUnion('evidenceState', [
  z.object({
    ...measureKey, segment: text, study: text, evidenceState: z.literal('available'),
    status: available, method: text, n: z.int().positive(),
    answers: z.object({
      unmet: ratio, online: ratio, offline: ratio,
      wtp: z.object({ low: nonnegative, high: nonnegative }).refine(({low, high}) => low <= high),
    }).refine(({online, offline}) => Math.abs(online + offline - 100) <= 0.100000001, 'Tổng tỷ lệ hai kênh phải bằng 100%'),
  }),
  z.object({
    ...measureKey, segment: text, study: text, evidenceState: z.literal('no_evidence'),
    status: z.literal('unavailable'), method: z.null(), n: z.null(), answers: z.null(), reason: text,
  }),
]))

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const ring = z.array(position).min(4).refine((points) => {
  if (points.length < 4) return false
  const [originX, originY] = points[0]
  const last = points.at(-1)
  if (originX !== last?.[0] || originY !== last[1]) return false
  let doubleArea = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    doubleArea += (x1 - originX) * (y2 - originY) - (x2 - originX) * (y1 - originY)
  }
  return doubleArea !== 0
}, 'Vòng polygon phải khép kín và có diện tích')

const polygon = z.array(ring).min(1)
export const geometrySchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    properties: z.object({ geoId: text }),
    geometry: z.discriminatedUnion('type', [
      z.object({ type: z.literal('Polygon'), coordinates: polygon }),
      z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon).min(1) }),
    ]),
  })),
})
