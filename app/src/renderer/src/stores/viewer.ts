import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  isWorkspaceSourceFileRef,
  workspaceFileDisplayPath,
  workspaceFileKey,
  type WorkspaceViewMode
} from '../../../shared/workspace'
import { useWorkspaceStore } from './workspace'

interface RenderedTaskToggleInput {
  line: number
  checkboxColumn: number
  checked: boolean
}

function sourceLineAt(markdown: string, line: number): string | null {
  if (line < 1) return null

  let currentLine = 1
  let start = 0
  for (let index = 0; index < markdown.length; index += 1) {
    const char = markdown[index]
    if (char !== '\n' && char !== '\r') continue

    if (currentLine === line) return markdown.slice(start, index)
    if (char === '\r' && markdown[index + 1] === '\n') index += 1
    start = index + 1
    currentLine += 1
  }

  if (currentLine === line && start <= markdown.length) return markdown.slice(start)
  return null
}

function taskToggleFailureMessage(reason: string): string {
  switch (reason) {
    case 'source-line-changed':
      return 'Task changed on disk before it could be updated. Reloaded the file.'
    case 'missing-file':
      return 'Task file no longer exists.'
    case 'invalid-source':
      return 'Task file is outside the notes folder.'
    default:
      return 'Task changed before it could be updated. Reloaded the file.'
  }
}

export const useViewerStore = defineStore('viewer', () => {
  const workspace = useWorkspaceStore()
  const tree = ref<string[]>([])
  const notesRoot = ref<string | null>(null)
  const content = ref<string>('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeTab = computed(() => workspace.activeTab)
  const activeTabId = computed(() => activeTab.value?.id ?? null)
  const sourcePath = computed(() =>
    activeTab.value && isWorkspaceSourceFileRef(activeTab.value) ? activeTab.value.sourcePath : null
  )
  const displayPath = computed(() =>
    activeTab.value ? workspaceFileDisplayPath(activeTab.value) : null
  )
  const viewMode = computed<WorkspaceViewMode>(() => activeTab.value?.viewMode ?? 'preview')
  const sourceMode = computed(() => viewMode.value === 'source')

  let contentRequestId = 0
  let unsubscribeSourceChange: (() => void) | null = null
  let unsubscribeTreeChange: (() => void) | null = null
  let stopActiveTabWatch: (() => void) | null = null

  function sourcePathExists(paths: string[]): boolean {
    const tab = activeTab.value
    if (!tab || !isWorkspaceSourceFileRef(tab)) return true
    return paths.includes(tab.sourcePath)
  }

  function isCurrentRequest(requestId: number, tabId: string, requestedFileKey: string): boolean {
    const tab = activeTab.value
    return (
      requestId === contentRequestId &&
      tab?.id === tabId &&
      workspaceFileKey(tab) === requestedFileKey
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
      const requestedFileKey = workspaceFileKey(tab)
      const nextContent = await window.ryte.files.readWorkspaceTab({ tabId: tab.id })
      if (!isCurrentRequest(requestId, tab.id, requestedFileKey)) return

      await window.ryte.files.watchWorkspaceTab({ tabId: tab.id })
      if (!isCurrentRequest(requestId, tab.id, requestedFileKey)) return

      content.value = nextContent
      error.value = null
    } catch (e) {
      if (!isCurrentRequest(requestId, tab.id, workspaceFileKey(tab))) return
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

    const unsubscribeWorkspaceTabChange = window.ryte.files.onWorkspaceTabChange((changedTabId) => {
      if (changedTabId === activeTabId.value) {
        void loadActiveTab()
      }
    })

    unsubscribeTreeChange = window.ryte.files.onTreeChanged(() => {
      void refreshTree()
    })

    stopActiveTabWatch = watch(
      () => [activeTabId.value, displayPath.value] as const,
      () => {
        void loadActiveTab()
      }
    )

    const originalStopActiveTabWatch = stopActiveTabWatch
    stopActiveTabWatch = () => {
      originalStopActiveTabWatch?.()
      unsubscribeWorkspaceTabChange()
    }

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

  async function toggleRenderedTask(input: RenderedTaskToggleInput): Promise<void> {
    const currentSourcePath = sourcePath.value
    if (!currentSourcePath) {
      error.value = 'Tasks can only be updated for files in the notes folder.'
      return
    }

    const expectedLine = sourceLineAt(content.value, input.line)
    if (expectedLine === null) {
      error.value = 'Task line is no longer available.'
      return
    }

    try {
      const result = await window.ryte.tasks.toggle({
        sourcePath: currentSourcePath,
        line: input.line,
        checkboxColumn: input.checkboxColumn,
        checked: input.checked,
        expectedLine
      })

      if (result.ok) {
        content.value = result.markdown
        error.value = null
        return
      }

      error.value = taskToggleFailureMessage(result.reason)
      await loadActiveTab()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
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
    displayPath,
    selectedPath: displayPath,
    viewMode,
    sourceMode,
    hydrate,
    refreshTree,
    loadActiveTab,
    setViewMode,
    toggleSourceMode,
    toggleRenderedTask
  }
})
