import type { GeometryCollection, Snapshot } from '../types/snapshot'

export interface DataRepository {
  loadSnapshot(): Promise<Snapshot>
  loadGeometry(snapshot: Snapshot, provinceId: string | null): Promise<GeometryCollection>
}
