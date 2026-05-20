import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  shouldAutoCollapseSidebar,
  type WorkspaceShellUpdate,
  type WorkspaceState
} from '../../../shared/workspace'

export const useWorkspaceStore = defineStore('workspace', () => {
  const state = ref<WorkspaceState | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const shell = computed(
    () =>
      state.value?.shell ?? {
        sidebarCollapsed: false,
        sidebarWidth: SIDEBAR_DEFAULT_WIDTH
      }
  )

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
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.updateShell(patch)
    } catch (e) {
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

  function sidebarAutoCollapsed(viewportWidth: number): boolean {
    return shouldAutoCollapseSidebar(viewportWidth)
  }

  function sidebarWidthForViewport(viewportWidth: number): number {
    return clampSidebarWidth(shell.value.sidebarWidth, viewportWidth)
  }

  return {
    state,
    shell,
    loading,
    error,
    hydrate,
    updateShell,
    setSidebarCollapsed,
    setSidebarWidth,
    sidebarAutoCollapsed,
    sidebarWidthForViewport,
    SIDEBAR_MIN_WIDTH
  }
})
