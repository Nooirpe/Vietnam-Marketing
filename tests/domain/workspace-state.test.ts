import { describe, expect, it } from 'vitest'
import {
  createSavedView, moveShortlistItem, parseWorkspaceData, readWorkspaceStorage, sortShortlist, writeWorkspaceStorage,
  type ShortlistItem,
} from '../../src/domain/workspaceState'

describe('workspace persistence helpers', () => {
  it('recovers valid local data, removes duplicate ids, and reports malformed JSON', () => {
    const parsed = parseWorkspaceData(JSON.stringify({
      shortlist: [
        { geoId: 'P01', note: 'A', addedAt: 1 },
        { geoId: 'P01', note: 'duplicate', addedAt: 2 },
        { geoId: 'P79', note: null, addedAt: Number.NaN },
      ],
      savedViews: [{ id: 'view-1', name: 'Toàn quốc', search: '?period=2025-Q3', savedAt: 3 }],
    }))
    expect(parsed.invalid).toBe(false)
    expect(parsed.data.shortlist).toEqual([
      { geoId: 'P01', note: 'A', addedAt: 1 },
      { geoId: 'P79', note: '', addedAt: 0 },
    ])
    expect(parsed.data.savedViews[0].search).toBe('period=2025-Q3')
    expect(parseWorkspaceData('{').invalid).toBe(true)
  })

  it('moves and sorts shortlist items without mutating the original order', () => {
    const items: ShortlistItem[] = [
      { geoId: 'P01', note: '', addedAt: 1 },
      { geoId: 'P79', note: '', addedAt: 3 },
      { geoId: 'W00004', note: '', addedAt: 2 },
    ]
    const moved = moveShortlistItem(items, 'W00004', -1)
    expect(moved.map((item) => item.geoId)).toEqual(['P01', 'W00004', 'P79'])
    expect(items.map((item) => item.geoId)).toEqual(['P01', 'P79', 'W00004'])
    expect(sortShortlist(items, 'recent', new Map()).map((item) => item.geoId))
      .toEqual(['P79', 'W00004', 'P01'])
    expect(sortShortlist(items, 'name', new Map([['P01', 'Hà Nội'], ['P79', 'Hồ Chí Minh']]))
      .map((item) => item.geoId)).toEqual(['P01', 'P79', 'W00004'])
  })

  it('trims saved view names and preserves the complete query string', () => {
    expect(createSavedView('  Bản đồ lọc  ', '?period=2025-Q3&layer=unmet&filters=%5B%5D', 'view-1', 42))
      .toEqual({
        id: 'view-1',
        name: 'Bản đồ lọc',
        search: 'period=2025-Q3&layer=unmet&filters=%5B%5D',
        savedAt: 42,
      })
    expect(createSavedView(' ', '', 'view-2', 42)).toBeNull()
  })

  it('keeps state usable when browser storage is blocked', () => {
    const storage = {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('blocked') },
    }
    const fallback = {
      shortlist: [{ geoId: 'P01', note: '', addedAt: 1 }],
      savedViews: [],
    }
    expect(readWorkspaceStorage(storage, fallback)).toEqual({ data: fallback, state: 'blocked' })
    expect(writeWorkspaceStorage(storage, fallback)).toBe(false)
  })
})
