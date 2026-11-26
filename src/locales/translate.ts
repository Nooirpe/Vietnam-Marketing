import type { TranslationKey } from './I18nContext'

const indicatorKeys: Record<string, TranslationKey> = {
  population: 'indicator.population',
  population_density: 'indicator.population_density',
  spending: 'indicator.spending',
  retail: 'indicator.retail',
  poi_density: 'indicator.poi_density',
  unmet: 'indicator.unmet',
  online: 'indicator.online',
  offline: 'indicator.offline',
  wtp: 'indicator.wtp',
}

export function indicatorLabel(
  code: string,
  fallback: string,
  t: (key: TranslationKey) => string,
): string {
  const key = indicatorKeys[code]
  return key ? t(key) : fallback
}
