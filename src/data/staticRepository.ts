import { z } from 'zod'
import type { GeometryCollection, Snapshot } from '../types/snapshot'
import type { DataRepository } from './repository'
import { dataKey, indexSnapshot } from './indexes'
import { evidenceSchema, geometrySchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema } from './schemas'

const emptyCollection: GeometryCollection = { type: 'FeatureCollection', features: [] }

export function createStaticRepository(baseUrl: string, fetcher: typeof fetch = fetch): DataRepository {
  let snapshotRequest: Promise<Snapshot> | undefined
  const geometries = new Map<string, Promise<GeometryCollection>>()

  async function read<T>(file: string, schema: z.ZodType<T>): Promise<T> {
    try {
      const response = await fetcher(`${baseUrl}${file}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const parsed = schema.safeParse(await response.json())
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`).join('; '))
      }
      return parsed.data
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    loadSnapshot() {
      snapshotRequest ??= (async () => {
        const manifest = await read('manifest.json', manifestSchema)
        const [units, indicators, observations, evidence] = await Promise.all([
          read(manifest.files.units, unitsSchema), read(manifest.files.dictionary, indicatorsSchema),
          read(manifest.files.observations, observationsSchema), read(manifest.files.evidence, evidenceSchema),
        ])
        return indexSnapshot(manifest, units, indicators, observations, evidence)
      })().catch((error: unknown) => {
        snapshotRequest = undefined
        throw error
      })
      return snapshotRequest
    },
    async loadGeometry(snapshot, provinceId) {
      const { manifest, unitsById } = snapshot
      const isWard = provinceId !== null
      if (isWard && unitsById.get(provinceId)?.level !== 'province') return emptyCollection
      const splitFile = isWard ? manifest.files.wardsByProvince?.[provinceId] : undefined
      const file = isWard ? splitFile ?? manifest.files.wards : manifest.files.provinces
      if (!file) return emptyCollection
      const key = dataKey(manifest.datasetVersion, manifest.boundaryVersion, file)
      let request = geometries.get(key)
      if (!request) {
        request = read(file, geometrySchema).then((collection) => {
          const ids = new Set<string>()
          for (const [index, { properties }] of collection.features.entries()) {
            const { geoId } = properties
            const unit = unitsById.get(geoId)
            if (ids.has(geoId) || unit?.level !== (isWard ? 'ward' : 'province') || (splitFile && unit.parentId !== provinceId)) {
              throw new Error(`${file}.features[${index}].properties.geoId: khóa địa bàn trùng hoặc không khớp lớp (${geoId})`)
            }
            ids.add(geoId)
          }
          const expected = isWard ? splitFile ? undefined : manifest.coverage.wardCount : manifest.coverage.provinceCount
          if (expected !== undefined && ids.size !== expected) {
            throw new Error(`${file}: số lượng vùng không khớp manifest (${ids.size}/${expected})`)
          }
          return collection
        }).catch((error: unknown) => {
          geometries.delete(key)
          throw error
        })
        geometries.set(key, request)
      }
      const collection = await request
      if (!isWard || splitFile) return collection
      return { ...collection, features: collection.features.filter(({ properties }) => unitsById.get(properties.geoId)?.parentId === provinceId) }
    },
  }
}
