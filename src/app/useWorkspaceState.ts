import { useContext } from 'react'
import { WorkspaceStateContext } from './workspaceStateContext'

export function useWorkspaceState() {
  const value = useContext(WorkspaceStateContext)
  if (!value) throw new Error('useWorkspaceState must be used within WorkspaceStateProvider')
  return value
}
