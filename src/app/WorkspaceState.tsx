import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  createSavedView, emptyWorkspaceData, MAX_SHORTLIST_NOTE_LENGTH, readWorkspaceStorage,
  writeWorkspaceStorage, type WorkspaceData, type WorkspaceStorageState,
} from '../domain/workspaceState'
import { WorkspaceStateContext } from './workspaceStateContext'

let memoryFallback: WorkspaceData = emptyWorkspaceData

function readWorkspaceData(): { data: WorkspaceData; storageState: WorkspaceStorageState } {
  try {
    const result = readWorkspaceStorage(window.localStorage, memoryFallback)
    if (result.state === 'available') memoryFallback = result.data
    return { data: result.data, storageState: result.state }
  } catch {
    return { data: memoryFallback, storageState: 'blocked' }
  }
}

export function WorkspaceStateProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readWorkspaceData)
  const [data, setData] = useState(initial.data)
  const [storageState, setStorageState] = useState<WorkspaceStorageState>(initial.storageState)
  const dataRef = useRef(data)

  const commit = useCallback((next: WorkspaceData) => {
    memoryFallback = next
    dataRef.current = next
    setData(next)
    try {
      setStorageState(writeWorkspaceStorage(window.localStorage, next) ? 'available' : 'blocked')
    } catch {
      setStorageState('blocked')
    }
  }, [])

  const isShortlisted = useCallback((geoId: string) =>
    dataRef.current.shortlist.some((item) => item.geoId === geoId), [])
  const pin = useCallback((geoId: string) => {
    if (!geoId || isShortlisted(geoId)) return
    commit({ ...dataRef.current, shortlist: [...dataRef.current.shortlist, { geoId, note: '', addedAt: Date.now() }] })
  }, [commit, isShortlisted])
  const unpin = useCallback((geoId: string) => {
    commit({ ...dataRef.current, shortlist: dataRef.current.shortlist.filter((item) => item.geoId !== geoId) })
  }, [commit])
  const setNote = useCallback((geoId: string, note: string) => {
    commit({
      ...dataRef.current,
      shortlist: dataRef.current.shortlist.map((item) => item.geoId === geoId
        ? { ...item, note: note.slice(0, MAX_SHORTLIST_NOTE_LENGTH) } : item),
    })
  }, [commit])
  const move = useCallback((geoId: string, delta: number) => {
    const current = dataRef.current.shortlist
    const index = current.findIndex((item) => item.geoId === geoId)
    const destination = Math.max(0, Math.min(current.length - 1, index + delta))
    if (index < 0 || index === destination) return
    const next = [...current]
    const item = next[index]
    next[index] = next[destination]
    next[destination] = item
    commit({ ...dataRef.current, shortlist: next })
  }, [commit])
  const saveView = useCallback((name: string, search: string) => {
    const view = createSavedView(name, search, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, Date.now())
    if (!view) return false
    commit({ ...dataRef.current, savedViews: [view, ...dataRef.current.savedViews].slice(0, 50) })
    return true
  }, [commit])
  const removeView = useCallback((id: string) => {
    commit({ ...dataRef.current, savedViews: dataRef.current.savedViews.filter((view) => view.id !== id) })
  }, [commit])

  return (
    <WorkspaceStateContext.Provider value={{
      ...data, storageState, isShortlisted, pin, unpin, setNote, move, saveView, removeView,
    }}>
      {children}
    </WorkspaceStateContext.Provider>
  )
}
