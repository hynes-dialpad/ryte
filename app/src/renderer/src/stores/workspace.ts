import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  WORKSPACE_RECENTS_LIMIT,
  WORKSPACE_SCHEMA_VERSION,
  clampSidebarWidth,
  shouldAutoCollapseSidebar,
  type WorkspaceCloseTabInput,
  type WorkspaceFileTab,
  type WorkspaceFocusTabInput,
  type WorkspaceOpenFileInput,
  type WorkspaceRecordRecentInput,
  type WorkspaceSidebarMode,
  type WorkspaceShellState,
  type WorkspaceSetOutlineCollapsedInput,
  type WorkspaceShellUpdate,
  type WorkspaceState,
  type WorkspaceUpdateTabViewModeInput
} from '../../../shared/workspace'

let optimisticTabId = 0

function defaultRendererWorkspaceState(): WorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    shell: {
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
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
    outlineCollapsedByPath: {}
  }
}

function normalizeOptimisticSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH
  return Math.max(SIDEBAR_MIN_WIDTH, Math.round(width))
}

function applyOptimisticShellPatch(
  current: WorkspaceState | null,
  patch: WorkspaceShellUpdate
): WorkspaceState {
  const base = current ?? defaultRendererWorkspaceState()
  return {
    ...base,
    shell: {
      ...base.shell,
      ...(patch.sidebarCollapsed !== undefined ? { sidebarCollapsed: patch.sidebarCollapsed } : {}),
      ...(patch.sidebarWidth !== undefined
        ? { sidebarWidth: normalizeOptimisticSidebarWidth(patch.sidebarWidth) }
        : {}),
      ...(patch.activeSidebar !== undefined ? { activeSidebar: patch.activeSidebar } : {})
    }
  }
}

function titleFromSourcePath(sourcePath: string): string {
  const parts = sourcePath.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? sourcePath
}

function recordRecentInState(state: WorkspaceState, sourcePath: string): WorkspaceState {
  return {
    ...state,
    recents: [
      {
        sourcePath,
        title: titleFromSourcePath(sourcePath),
        openedAt: new Date().toISOString()
      },
      ...state.recents.filter((recent) => recent.sourcePath !== sourcePath)
    ].slice(0, WORKSPACE_RECENTS_LIMIT)
  }
}

function closeTabInState(state: WorkspaceState, tabId: string): WorkspaceState {
  const closedIndex = state.tabs.findIndex((tab) => tab.id === tabId)
  if (closedIndex === -1) return state

  const tabs = state.tabs.filter((tab) => tab.id !== tabId)
  const activeTabId =
    state.activeTabId === tabId
      ? (tabs[closedIndex]?.id ?? tabs[closedIndex - 1]?.id ?? null)
      : state.activeTabId

  return {
    ...state,
    tabs,
    activeTabId
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const state = ref<WorkspaceState | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const shell = computed<WorkspaceShellState>(
    () =>
      state.value?.shell ?? {
        sidebarCollapsed: false,
        sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
        activeSidebar: 'files'
      }
  )
  const tabs = computed(() => state.value?.tabs ?? [])
  const activeTabId = computed(() => state.value?.activeTabId ?? null)
  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null)
  const recents = computed(() => state.value?.recents ?? [])
  const outlineCollapsedByPath = computed(() => state.value?.outlineCollapsedByPath ?? {})

  async function hydrate(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.getState()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function updateShell(patch: WorkspaceShellUpdate): Promise<void> {
    const previousState = state.value
    state.value = applyOptimisticShellPatch(state.value, patch)
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.updateShell(patch)
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function runOptimisticWorkspaceOperation(
    applyLocal: (base: WorkspaceState) => WorkspaceState,
    runRemote: () => Promise<WorkspaceState>
  ): Promise<void> {
    const previousState = state.value
    state.value = applyLocal(state.value ?? defaultRendererWorkspaceState())
    loading.value = true
    error.value = null
    try {
      state.value = await runRemote()
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function openFile(input: WorkspaceOpenFileInput): Promise<void> {
    const temporaryTabId = `optimistic-workspace-tab-${++optimisticTabId}`
    await runOptimisticWorkspaceOperation(
      (base) => {
        const tab: WorkspaceFileTab = {
          id: temporaryTabId,
          sourcePath: input.sourcePath,
          title: titleFromSourcePath(input.sourcePath),
          viewMode: 'preview'
        }
        return recordRecentInState(
          {
            ...base,
            tabs: [...base.tabs, tab],
            activeTabId: tab.id
          },
          input.sourcePath
        )
      },
      () => window.ryte.workspace.openFile(input)
    )
  }

  async function openOrFocusFile(input: WorkspaceOpenFileInput): Promise<void> {
    const existingTab = tabs.value.findLast((tab) => tab.sourcePath === input.sourcePath)
    if (existingTab) {
      await focusTab({ tabId: existingTab.id })
      return
    }
    await openFile(input)
  }

  async function openExplicitFile(input: WorkspaceOpenFileInput): Promise<void> {
    const existingTab = tabs.value.findLast((tab) => tab.sourcePath === input.sourcePath)
    if (existingTab) {
      await focusTab({ tabId: existingTab.id })
      await recordRecent({ sourcePath: input.sourcePath })
      return
    }

    await openFile(input)
  }

  async function focusTab(input: WorkspaceFocusTabInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => ({
        ...base,
        activeTabId: base.tabs.some((tab) => tab.id === input.tabId)
          ? input.tabId
          : base.activeTabId
      }),
      () => window.ryte.workspace.focusTab(input)
    )
  }

  async function closeTab(input: WorkspaceCloseTabInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => closeTabInState(base, input.tabId),
      () => window.ryte.workspace.closeTab(input)
    )
  }

  async function closeTabToRecent(
    input: WorkspaceCloseTabInput & WorkspaceRecordRecentInput
  ): Promise<void> {
    try {
      await recordRecent({ sourcePath: input.sourcePath })
    } catch {
      // Closing should still work if the backing file is already missing.
    }
    await closeTab({ tabId: input.tabId })
  }

  async function updateTabViewMode(input: WorkspaceUpdateTabViewModeInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => ({
        ...base,
        tabs: base.tabs.map((tab) =>
          tab.id === input.tabId ? { ...tab, viewMode: input.viewMode } : tab
        )
      }),
      () => window.ryte.workspace.updateTabViewMode(input)
    )
  }

  async function recordRecent(input: WorkspaceRecordRecentInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => recordRecentInState(base, input.sourcePath),
      () => window.ryte.workspace.recordRecent(input)
    )
  }

  async function setOutlineCollapsed(input: WorkspaceSetOutlineCollapsedInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => ({
        ...base,
        outlineCollapsedByPath: {
          ...base.outlineCollapsedByPath,
          [input.sourcePath]: input.collapsed
        }
      }),
      () => window.ryte.workspace.setOutlineCollapsed(input)
    )
  }

  async function pruneMissingFileRefs(): Promise<void> {
    const previousState = state.value
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.pruneMissingFileRefs()
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
    await updateShell({ sidebarCollapsed: collapsed })
  }

  async function setSidebarWidth(width: number, viewportWidth: number): Promise<void> {
    await updateShell({ sidebarWidth: clampSidebarWidth(width, viewportWidth) })
  }

  async function setActiveSidebar(activeSidebar: WorkspaceSidebarMode): Promise<void> {
    await updateShell({ activeSidebar })
  }

  function sidebarAutoCollapsed(viewportWidth: number): boolean {
    return shouldAutoCollapseSidebar(viewportWidth)
  }

  function sidebarWidthForViewport(viewportWidth: number): number {
    return clampSidebarWidth(shell.value.sidebarWidth, viewportWidth)
  }

  return {
    state,
    shell,
    tabs,
    activeTabId,
    activeTab,
    recents,
    outlineCollapsedByPath,
    loading,
    error,
    hydrate,
    updateShell,
    openFile,
    focusTab,
    closeTab,
    closeTabToRecent,
    openOrFocusFile,
    openExplicitFile,
    updateTabViewMode,
    recordRecent,
    setOutlineCollapsed,
    pruneMissingFileRefs,
    setSidebarCollapsed,
    setSidebarWidth,
    setActiveSidebar,
    sidebarAutoCollapsed,
    sidebarWidthForViewport,
    SIDEBAR_MIN_WIDTH
  }
})
