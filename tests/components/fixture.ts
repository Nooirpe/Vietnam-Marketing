import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { indexSnapshot } from '../../src/data/indexes'
import {
  evidenceSchema, indicatorsSchema, manifestSchema, observationsSchema, unitsSchema,
} from '../../src/data/schemas'

function readData(file: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'public', 'data', 'v1', file), 'utf8'))
}

const manifest = manifestSchema.parse(readData('manifest.json'))

export const demoSnapshot = indexSnapshot(
  manifest,
  unitsSchema.parse(readData(manifest.files.units)),
  indicatorsSchema.parse(readData(manifest.files.dictionary)),
  observationsSchema.parse(readData(manifest.files.observations)),
  evidenceSchema.parse(readData(manifest.files.evidence)),
)
