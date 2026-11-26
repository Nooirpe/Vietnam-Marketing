import type { Criterion } from './scoreCandidates'

export type SectorId = 'grocery' | 'coffee' | 'pharmacy'

export interface SectorPreset {
  id: SectorId
  nameKey: 'sector.grocery' | 'sector.coffee' | 'sector.pharmacy'
  descriptionKey: 'sector.groceryDescription' | 'sector.coffeeDescription' | 'sector.pharmacyDescription'
  criteria: Criterion[]
}

export const sectorPresets: readonly SectorPreset[] = [
  {
    id: 'grocery',
    nameKey: 'sector.grocery',
    descriptionKey: 'sector.groceryDescription',
    criteria: [
      { code: 'unmet', direction: 'benefit', weight: 60, required: true },
      { code: 'poi_density', direction: 'cost', weight: 40, required: true },
    ],
  },
  {
    id: 'coffee',
    nameKey: 'sector.coffee',
    descriptionKey: 'sector.coffeeDescription',
    criteria: [
      { code: 'spending', direction: 'benefit', weight: 45, required: true },
      { code: 'population_density', direction: 'benefit', weight: 35, required: true },
      { code: 'population', direction: 'benefit', weight: 20, required: true },
    ],
  },
  {
    id: 'pharmacy',
    nameKey: 'sector.pharmacy',
    descriptionKey: 'sector.pharmacyDescription',
    criteria: [
      { code: 'population', direction: 'benefit', weight: 50, required: true },
      { code: 'population_density', direction: 'benefit', weight: 30, required: true },
      { code: 'spending', direction: 'benefit', weight: 20, required: true },
    ],
  },
]

export const defaultSectorId: SectorId = 'grocery'

export function getSectorPreset(id: string): SectorPreset | undefined {
  return sectorPresets.find(preset => preset.id === id)
}
