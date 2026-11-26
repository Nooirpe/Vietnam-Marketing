import { createContext } from 'react'
import type {
  WorkspaceData, WorkspaceStorageState,
} from '../domain/workspaceState'

export interface WorkspaceStateValue extends WorkspaceData {
  storageState: WorkspaceStorageState
  isShortlisted: (geoId: string) => boolean
  pin: (geoId: string) => void
  unpin: (geoId: string) => void
  setNote: (geoId: string, note: string) => void
  move: (geoId: string, delta: number) => void
  saveView: (name: string, search: string) => boolean
  removeView: (id: string) => void
}

export const WorkspaceStateContext = createContext<WorkspaceStateValue | null>(null)
