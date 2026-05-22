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

  it('creates a temporary optimistic tab for openFile and reconciles returned state', async () => {
    const initial = workspaceState()
    const returned = workspaceState({
      tabs: [
        {
          id: 'real-tab-id',
          sourcePath: 'folder/a.md',
          title: 'a.md',
          viewMode: 'preview'
        }
      ],
      activeTabId: 'real-tab-id',
      recents: [
        {
          sourcePath: 'folder/a.md',
          title: 'a.md',
          openedAt: '2026-05-21T12:00:00.000Z'
        }
      ]
    })
    let resolveOpen: (state: WorkspaceState) => void = () => {}
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      openFile: vi.fn(
        () =>
          new Promise<WorkspaceState>((resolve) => {
            resolveOpen = resolve
          })
      )
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const open = store.openFile({ sourcePath: 'folder/a.md' })
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]).toMatchObject({
      sourcePath: 'folder/a.md',
      title: 'a.md',
      viewMode: 'preview'
    })
    expect(store.tabs[0]?.id).toMatch(/^optimistic-workspace-tab-/)
    expect(store.activeTabId).toBe(store.tabs[0]?.id)
    expect(store.recents[0]?.sourcePath).toBe('folder/a.md')

    resolveOpen(returned)
    await open

    expect(store.state).toEqual(returned)
    expect(store.tabs[0]?.id).toBe('real-tab-id')
    expect(store.error).toBeNull()
  })

  it('focuses the latest matching tab for openOrFocusFile without opening a duplicate', async () => {
    const tabA = { id: 'tab-a', sourcePath: 'a.md', title: 'a.md', viewMode: 'preview' as const }
    const tabB = { id: 'tab-b', sourcePath: 'b.md', title: 'b.md', viewMode: 'preview' as const }
    const tabA2 = {
      id: 'tab-a-2',
      sourcePath: 'a.md',
      title: 'a.md',
      viewMode: 'source' as const
    }
    const initial = workspaceState({ tabs: [tabA, tabB, tabA2], activeTabId: tabB.id })
    const focused = workspaceState({ tabs: [tabA, tabB, tabA2], activeTabId: tabA2.id })
    const openFile = vi.fn()
    const focusTab = vi.fn().mockResolvedValue(focused)
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      focusTab,
      openFile
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.openOrFocusFile({ sourcePath: 'a.md' })

    expect(focusTab).toHaveBeenCalledWith({ tabId: tabA2.id })
    expect(openFile).not.toHaveBeenCalled()
    expect(store.activeTabId).toBe(tabA2.id)
  })

  it('applies optimistic focus, close, view mode, recent, and outline updates', async () => {
    const tabA = { id: 'tab-a', sourcePath: 'a.md', title: 'a.md', viewMode: 'preview' as const }
    const tabB = { id: 'tab-b', sourcePath: 'b.md', title: 'b.md', viewMode: 'preview' as const }
    const initial = workspaceState({ tabs: [tabA, tabB], activeTabId: tabA.id })
    const focused = workspaceState({ tabs: [tabA, tabB], activeTabId: tabB.id })
    const updatedViewMode = workspaceState({
      tabs: [{ ...tabA, viewMode: 'source' }, tabB],
      activeTabId: tabB.id
    })
    const closed = workspaceState({
      tabs: [{ ...tabA, viewMode: 'source' }],
      activeTabId: tabA.id
    })
    const recent = workspaceState({
      tabs: [{ ...tabA, viewMode: 'source' }],
      activeTabId: tabA.id,
      recents: [{ sourcePath: 'c.md', title: 'c.md', openedAt: '2026-05-21T12:00:00.000Z' }]
    })
    const outlined = workspaceState({
      ...recent,
      outlineCollapsedByPath: { 'c.md': true }
    })
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      focusTab: vi.fn().mockResolvedValue(focused),
      updateTabViewMode: vi.fn().mockResolvedValue(updatedViewMode),
      closeTab: vi.fn().mockResolvedValue(closed),
      recordRecent: vi.fn().mockResolvedValue(recent),
      setOutlineCollapsed: vi.fn().mockResolvedValue(outlined)
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const focus = store.focusTab({ tabId: tabB.id })
    expect(store.activeTabId).toBe(tabB.id)
    await focus

    const updateViewMode = store.updateTabViewMode({ tabId: tabA.id, viewMode: 'source' })
    expect(store.tabs[0]?.viewMode).toBe('source')
    await updateViewMode

    const close = store.closeTab({ tabId: tabB.id })
    expect(store.tabs.map((tab) => tab.id)).toEqual([tabA.id])
    expect(store.activeTabId).toBe(tabA.id)
    await close

    const record = store.recordRecent({ sourcePath: 'c.md' })
    expect(store.recents[0]).toMatchObject({ sourcePath: 'c.md', title: 'c.md' })
    await record

    const outline = store.setOutlineCollapsed({ sourcePath: 'c.md', collapsed: true })
    expect(store.outlineCollapsedByPath).toEqual({ 'c.md': true })
    await outline

    expect(store.state).toEqual(outlined)
  })

  it('rolls back optimistic workspace operations when IPC rejects', async () => {
    const initial = workspaceState()
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      openFile: vi.fn().mockRejectedValue(new Error('Invalid workspace source path'))
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const open = store.openFile({ sourcePath: '../a.md' })
    expect(store.tabs).toHaveLength(1)

    await expect(open).rejects.toThrow('Invalid workspace source path')
    expect(store.state).toEqual(initial)
    expect(store.error).toBe('Invalid workspace source path')
  })
})
