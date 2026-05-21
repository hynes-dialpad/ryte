import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import type { WorkspaceViewMode } from '../../../shared/workspace'
import { useWorkspaceStore } from './workspace'

export const useViewerStore = defineStore('viewer', () => {
  const workspace = useWorkspaceStore()
  const tree = ref<string[]>([])
  const notesRoot = ref<string | null>(null)
  const content = ref<string>('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeTab = computed(() => workspace.activeTab)
  const activeTabId = computed(() => activeTab.value?.id ?? null)
  const sourcePath = computed(() => activeTab.value?.sourcePath ?? null)
  const viewMode = computed<WorkspaceViewMode>(() => activeTab.value?.viewMode ?? 'preview')
  const sourceMode = computed(() => viewMode.value === 'source')

  let contentRequestId = 0
  let unsubscribeSourceChange: (() => void) | null = null
  let unsubscribeTreeChange: (() => void) | null = null
  let stopActiveTabWatch: (() => void) | null = null

  function sourcePathExists(paths: string[]): boolean {
    return !sourcePath.value || paths.includes(sourcePath.value)
  }

  function isCurrentRequest(
    requestId: number,
    tabId: string,
    requestedSourcePath: string
  ): boolean {
    const tab = activeTab.value
    return (
      requestId === contentRequestId && tab?.id === tabId && tab.sourcePath === requestedSourcePath
    )
  }

  async function refreshTree(): Promise<void> {
    const { notesRoot: root, paths } = await window.ryte.files.listTree()
    notesRoot.value = root
    tree.value = paths

    if (!sourcePathExists(paths)) {
      try {
        await workspace.pruneMissingFileRefs()
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
      }
    }
  }

  async function loadActiveTab(): Promise<void> {
    const tab = activeTab.value
    const requestId = ++contentRequestId

    if (!tab) {
      loading.value = false
      content.value = ''
      error.value = null
      try {
        await window.ryte.files.unwatch()
      } catch (e) {
        if (requestId === contentRequestId) {
          error.value = e instanceof Error ? e.message : String(e)
        }
      }
      return
    }

    loading.value = true
    content.value = ''
    error.value = null

    try {
      const nextContent = await window.ryte.files.readSource({ sourcePath: tab.sourcePath })
      if (!isCurrentRequest(requestId, tab.id, tab.sourcePath)) return

      await window.ryte.files.watchSource({ sourcePath: tab.sourcePath })
      if (!isCurrentRequest(requestId, tab.id, tab.sourcePath)) return

      content.value = nextContent
      error.value = null
    } catch (e) {
      if (!isCurrentRequest(requestId, tab.id, tab.sourcePath)) return
      error.value = e instanceof Error ? e.message : String(e)
      content.value = ''
      try {
        await window.ryte.files.unwatch()
      } catch {
        // Preserve the read/watch error as the actionable viewer error.
      }
    } finally {
      if (requestId === contentRequestId) loading.value = false
    }
  }

  async function hydrate(): Promise<void> {
    await refreshTree()

    unsubscribeSourceChange?.()
    unsubscribeTreeChange?.()
    stopActiveTabWatch?.()

    unsubscribeSourceChange = window.ryte.files.onSourceChange((changedSourcePath) => {
      if (changedSourcePath === sourcePath.value) {
        void loadActiveTab()
      }
    })

    unsubscribeTreeChange = window.ryte.files.onTreeChanged(() => {
      void refreshTree()
    })

    stopActiveTabWatch = watch(
      () => [activeTabId.value, sourcePath.value] as const,
      () => {
        void loadActiveTab()
      }
    )

    await loadActiveTab()
  }

  async function setViewMode(nextViewMode: WorkspaceViewMode): Promise<void> {
    const tab = activeTab.value
    if (!tab || tab.viewMode === nextViewMode) return
    await workspace.updateTabViewMode({ tabId: tab.id, viewMode: nextViewMode })
  }

  async function toggleSourceMode(): Promise<void> {
    await setViewMode(sourceMode.value ? 'preview' : 'source')
  }

  return {
    tree,
    notesRoot,
    content,
    loading,
    error,
    activeTab,
    activeTabId,
    sourcePath,
    selectedPath: sourcePath,
    viewMode,
    sourceMode,
    hydrate,
    refreshTree,
    loadActiveTab,
    setViewMode,
    toggleSourceMode
  }
})
