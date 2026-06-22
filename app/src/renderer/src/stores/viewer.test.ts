import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceFileTab,
  type WorkspaceState
} from '../../../shared/workspace'
import { useViewerStore } from './viewer'
import { useWorkspaceStore } from './workspace'

function workspaceState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    shell: {
      sidebarCollapsed: false,
      sidebarWidth: 360,
      activeSidebar: 'files'
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

function tab(overrides: Partial<WorkspaceFileTab>): WorkspaceFileTab {
  return {
    id: 'tab-a',
    sourcePath: 'a.md',
    title: 'a.md',
    viewMode: 'preview',
    ...overrides
  }
}

async function flushAsync(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('useViewerStore', () => {
  let sourceChangeHandler: ((sourcePath: string) => void) | null = null
  let treeChangeHandler: (() => void) | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    sourceChangeHandler = null
    treeChangeHandler = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function installRyteApi({
    files,
    workspace
  }: {
    files?: Partial<Window['ryte']['files']>
    workspace?: Partial<Window['ryte']['workspace']>
  }): void {
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['a.md', 'b.md'] }),
          readSource: vi.fn().mockResolvedValue('# A\n'),
          watchSource: vi.fn().mockResolvedValue(undefined),
          unwatch: vi.fn().mockResolvedValue(undefined),
          onSourceChange: vi.fn((cb: (sourcePath: string) => void) => {
            sourceChangeHandler = cb
            return vi.fn()
          }),
          onTreeChanged: vi.fn((cb: () => void) => {
            treeChangeHandler = cb
            return vi.fn()
          }),
          ...files
        },
        workspace: {
          getState: vi.fn().mockResolvedValue(workspaceState()),
          updateTabViewMode: vi.fn().mockImplementation(({ tabId, viewMode }) =>
            Promise.resolve(
              workspaceState({
                tabs: [tab({ id: tabId, viewMode })],
                activeTabId: tabId
              })
            )
          ),
          pruneMissingFileRefs: vi.fn().mockResolvedValue(workspaceState()),
          ...workspace
        }
      }
    })
  }

  it('hydrates the active workspace tab through relative file APIs', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const readSource = vi.fn().mockResolvedValue('# A\n')
    const watchSource = vi.fn().mockResolvedValue(undefined)

    installRyteApi({
      files: { readSource, watchSource },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(readSource).toHaveBeenCalledWith({ sourcePath: 'a.md' })
    expect(watchSource).toHaveBeenCalledWith({ sourcePath: 'a.md' })
    expect(viewer.sourcePath).toBe('a.md')
    expect(viewer.content).toBe('# A\n')
  })

  it('updates active tab view mode through the workspace operation', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const updateTabViewMode = vi.fn().mockResolvedValue(
      workspaceState({
        tabs: [{ ...active, viewMode: 'source' }],
        activeTabId: active.id
      })
    )

    installRyteApi({
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        ),
        updateTabViewMode
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()
    await viewer.toggleSourceMode()

    expect(updateTabViewMode).toHaveBeenCalledWith({ tabId: active.id, viewMode: 'source' })
    expect(viewer.sourceMode).toBe(true)
  })

  it('ignores stale reads after the active tab changes', async () => {
    const tabA = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const tabB = tab({ id: 'tab-b', sourcePath: 'b.md', title: 'b.md' })
    let resolveA!: (content: string) => void
    const readSource = vi.fn(({ sourcePath }: { sourcePath: string }) => {
      if (sourcePath === 'a.md') {
        return new Promise<string>((resolve) => {
          resolveA = resolve
        })
      }
      return Promise.resolve('# B\n')
    })

    installRyteApi({
      files: { readSource },
      workspace: {
        getState: vi.fn().mockResolvedValue(workspaceState())
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    workspace.state = workspaceState({ tabs: [tabA], activeTabId: tabA.id })
    await nextTick()
    workspace.state = workspaceState({ tabs: [tabA, tabB], activeTabId: tabB.id })
    await flushAsync()

    expect(viewer.sourcePath).toBe('b.md')
    expect(viewer.content).toBe('# B\n')

    resolveA('# A\n')
    await flushAsync()

    expect(viewer.sourcePath).toBe('b.md')
    expect(viewer.content).toBe('# B\n')
  })

  it('reloads the active tab when a matching relative source change event arrives', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const readSource = vi.fn().mockResolvedValueOnce('# A\n').mockResolvedValueOnce('# A updated\n')

    installRyteApi({
      files: { readSource },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    sourceChangeHandler?.('b.md')
    await flushAsync()
    expect(viewer.content).toBe('# A\n')

    sourceChangeHandler?.('a.md')
    await flushAsync()
    expect(viewer.content).toBe('# A updated\n')
  })

  it('prunes missing workspace refs before hydrating from the repaired active tab', async () => {
    const missing = tab({ id: 'tab-missing', sourcePath: 'missing.md', title: 'missing.md' })
    const repaired = tab({ id: 'tab-b', sourcePath: 'b.md', title: 'b.md' })
    const pruneMissingFileRefs = vi.fn().mockResolvedValue(
      workspaceState({
        tabs: [repaired],
        activeTabId: repaired.id
      })
    )
    const readSource = vi.fn().mockResolvedValue('# B\n')

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['b.md'] }),
        readSource
      },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [missing, repaired],
            activeTabId: missing.id
          })
        ),
        pruneMissingFileRefs
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(pruneMissingFileRefs).toHaveBeenCalledTimes(1)
    expect(readSource).toHaveBeenCalledWith({ sourcePath: 'b.md' })
    expect(viewer.sourcePath).toBe('b.md')
    expect(viewer.content).toBe('# B\n')
  })

  it('refreshes and prunes when the tree watcher reports a change', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const repaired = tab({ id: 'tab-b', sourcePath: 'b.md', title: 'b.md' })
    const listTree = vi
      .fn()
      .mockResolvedValueOnce({ notesRoot: '/notes', paths: ['a.md', 'b.md'] })
      .mockResolvedValueOnce({ notesRoot: '/notes', paths: ['b.md'] })
    const pruneMissingFileRefs = vi.fn().mockResolvedValue(
      workspaceState({
        tabs: [repaired],
        activeTabId: repaired.id
      })
    )

    installRyteApi({
      files: { listTree },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active, repaired],
            activeTabId: active.id
          })
        ),
        pruneMissingFileRefs
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    treeChangeHandler?.()
    await flushAsync()

    expect(pruneMissingFileRefs).toHaveBeenCalledTimes(1)
    expect(viewer.sourcePath).toBe('b.md')
  })
})
