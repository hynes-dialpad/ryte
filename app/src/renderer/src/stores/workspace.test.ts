import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WORKSPACE_SCHEMA_VERSION, type WorkspaceState } from '../../../shared/workspace'
import { useWorkspaceStore } from './workspace'

function workspaceState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    shell: {
      sidebarCollapsed: false,
      sidebarWidth: 360
    },
    window: {
      bounds: null,
      maximized: false,
      fullscreen: false
    },
    tabs: [],
    activeTabId: null,
    recents: [],
    outlineCollapsedByPath: {},
    ...overrides
  }
}

function installWorkspaceApi(workspace: Partial<Window['ryte']['workspace']>): void {
  vi.stubGlobal('window', {
    ryte: {
      workspace
    }
  })
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies shell patches optimistically before IPC resolves', async () => {
    const initial = workspaceState()
    const persisted = workspaceState({
      shell: {
        sidebarCollapsed: true,
        sidebarWidth: 420
      }
    })
    let resolveUpdate: (state: WorkspaceState) => void = () => {}

    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      updateShell: vi.fn(
        () =>
          new Promise<WorkspaceState>((resolve) => {
            resolveUpdate = resolve
          })
      )
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const update = store.updateShell({ sidebarCollapsed: true, sidebarWidth: 420 })
    expect(store.shell).toEqual({
      sidebarCollapsed: true,
      sidebarWidth: 420
    })

    resolveUpdate(persisted)
    await update

    expect(store.state).toEqual(persisted)
    expect(store.error).toBeNull()
  })

  it('rolls back optimistic shell patches when IPC rejects', async () => {
    const initial = workspaceState()
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      updateShell: vi.fn().mockRejectedValue(new Error('Invalid workspace shell patch'))
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const update = store.updateShell({ sidebarCollapsed: true })
    expect(store.shell.sidebarCollapsed).toBe(true)

    await expect(update).rejects.toThrow('Invalid workspace shell patch')
    expect(store.state).toEqual(initial)
    expect(store.error).toBe('Invalid workspace shell patch')
  })
})
