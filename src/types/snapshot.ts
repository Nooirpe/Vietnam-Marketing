import type { z } from 'zod'
import type { evidenceSchema, geometrySchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema } from '../data/schemas'

export type Manifest = z.infer<typeof manifestSchema>
export type GeoUnit = z.infer<typeof unitsSchema>[number]
export type Indicator = z.infer<typeof indicatorsSchema>[number]
export type MarketObservation = z.infer<typeof observationsSchema>[number]
export type SurveyEvidence = z.infer<typeof evidenceSchema>[number]
export type GeometryCollection = z.infer<typeof geometrySchema>

export interface MetricContext {
  period: string
  segment: string
  study: string
}

export interface Snapshot {
  manifest: Manifest
  units: GeoUnit[]
  indicators: Indicator[]
  observations: MarketObservation[]
  evidence: SurveyEvidence[]
  unitsById: ReadonlyMap<string, GeoUnit>
  indicatorsByCode: ReadonlyMap<string, Indicator>
  observationsByKey: ReadonlyMap<string, MarketObservation>
  evidenceByKey: ReadonlyMap<string, SurveyEvidence>
}
