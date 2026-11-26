export interface ShortlistItem {
  geoId: string
  note: string
  addedAt: number
}

export interface SavedView {
  id: string
  name: string
  search: string
  savedAt: number
}

export interface WorkspaceData {
  shortlist: ShortlistItem[]
  savedViews: SavedView[]
}

export type ShortlistSort = 'manual' | 'name' | 'recent'

export const MAX_SHORTLIST_NOTE_LENGTH = 280
export const MAX_SAVED_VIEW_NAME_LENGTH = 80
export const WORKSPACE_STORAGE_KEY = 'vietnam-market-intelligence.workspace.v1'

export const emptyWorkspaceData: WorkspaceData = { shortlist: [], savedViews: [] }

export type WorkspaceStorageState = 'available' | 'blocked' | 'invalid'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseWorkspaceData(raw: string | null): { data: WorkspaceData; invalid: boolean } {
  if (raw === null) return { data: emptyWorkspaceData, invalid: false }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) return { data: emptyWorkspaceData, invalid: true }
    throw error
  }
  if (!isRecord(value) || !Array.isArray(value.shortlist) || !Array.isArray(value.savedViews)) {
    return { data: emptyWorkspaceData, invalid: true }
  }

  const shortlist: ShortlistItem[] = []
  const seenGeoIds = new Set<string>()
  for (const item of value.shortlist) {
    if (!isRecord(item) || typeof item.geoId !== 'string' || !item.geoId || seenGeoIds.has(item.geoId)) continue
    seenGeoIds.add(item.geoId)
    shortlist.push({
      geoId: item.geoId,
      note: typeof item.note === 'string' ? item.note.slice(0, MAX_SHORTLIST_NOTE_LENGTH) : '',
      addedAt: typeof item.addedAt === 'number' && Number.isFinite(item.addedAt) ? item.addedAt : 0,
    })
  }

  const savedViews: SavedView[] = []
  const seenViewIds = new Set<string>()
  for (const view of value.savedViews) {
    if (!isRecord(view) || typeof view.id !== 'string' || !view.id || seenViewIds.has(view.id) ||
      typeof view.name !== 'string' || typeof view.search !== 'string') continue
    seenViewIds.add(view.id)
    savedViews.push({
      id: view.id,
      name: view.name.slice(0, MAX_SAVED_VIEW_NAME_LENGTH),
      search: view.search.replace(/^\?/, ''),
      savedAt: typeof view.savedAt === 'number' && Number.isFinite(view.savedAt) ? view.savedAt : 0,
    })
  }
  return { data: { shortlist, savedViews }, invalid: false }
}

export function readWorkspaceStorage(
  storage: Pick<Storage, 'getItem'>,
  fallback: WorkspaceData,
): { data: WorkspaceData; state: WorkspaceStorageState } {
  let raw: string | null
  try {
    raw = storage.getItem(WORKSPACE_STORAGE_KEY)
  } catch {
    return { data: fallback, state: 'blocked' }
  }
  if (raw === null) return { data: fallback, state: 'available' }
  const parsed = parseWorkspaceData(raw)
  return parsed.invalid
    ? { data: fallback, state: 'invalid' }
    : { data: parsed.data, state: 'available' }
}

export function writeWorkspaceStorage(
  storage: Pick<Storage, 'setItem'>,
  data: WorkspaceData,
): boolean {
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function moveShortlistItem(items: readonly ShortlistItem[], geoId: string, delta: number): ShortlistItem[] {
  const index = items.findIndex((item) => item.geoId === geoId)
  const destination = Math.max(0, Math.min(items.length - 1, index + delta))
  if (index < 0 || destination === index) return [...items]
  const next = [...items]
  const item = next[index]
  next[index] = next[destination]
  next[destination] = item
  return next
}

export function sortShortlist(
  items: readonly ShortlistItem[],
  sort: ShortlistSort,
  names: ReadonlyMap<string, string>,
): ShortlistItem[] {
  if (sort === 'manual') return [...items]
  return [...items].sort((a, b) => sort === 'recent'
    ? b.addedAt - a.addedAt || a.geoId.localeCompare(b.geoId)
    : (names.get(a.geoId) ?? a.geoId).localeCompare(names.get(b.geoId) ?? b.geoId, 'vi') ||
      a.geoId.localeCompare(b.geoId))
}

export function createSavedView(
  name: string,
  search: string,
  id: string,
  savedAt: number,
): SavedView | null {
  const normalizedName = name.trim().slice(0, MAX_SAVED_VIEW_NAME_LENGTH)
  if (!normalizedName || !Number.isFinite(savedAt)) return null
  return { id, name: normalizedName, search: search.replace(/^\?/, ''), savedAt }
}
