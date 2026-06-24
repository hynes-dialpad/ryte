<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import ryteLogo from './assets/ryte-logo.svg'
import FileOpenOverlay from './components/FileOpenOverlay.vue'
import HomeSidebar from './components/HomeSidebar.vue'
import SearchOverlay from './components/SearchOverlay.vue'
import SettingsModal from './components/SettingsModal.vue'
import ShellRail from './components/ShellRail.vue'
import Sidebar from './components/Sidebar.vue'
import StatusBar from './components/StatusBar.vue'
import Viewer from './components/Viewer.vue'
import WorkspaceTabs from './components/WorkspaceTabs.vue'
import { useIndexStatusStore } from './stores/index-status'
import { useSearchStore } from './stores/search'
import { useSettingsStore } from './stores/settings'
import { useViewerStore } from './stores/viewer'
import { useWorkspaceStore } from './stores/workspace'
import type { AppMenuCommand } from '../../shared/app-menu'
import type { WorkspaceSidebarMode } from '../../shared/workspace'
import { SIDEBAR_MIN_WIDTH, clampSidebarWidth } from '../../shared/workspace'
import {
  resolveAppShortcutAction,
  shouldScheduleControlShortcutBadges,
  type AppShortcutAction
} from './app-shortcuts'

const settings = useSettingsStore()
const indexStatus = useIndexStatusStore()
const viewer = useViewerStore()
const search = useSearchStore()
const workspace = useWorkspaceStore()
const showSettings = ref(false)
const showSearch = ref(false)
const showFileOpen = ref(false)
const viewportWidth = ref(window.innerWidth)
const dragSidebarWidth = ref<number | null>(null)
const dragSidebarCollapsed = ref(false)
const sidebarPopoverOpen = ref(false)
const hasActivatedHomeSidebar = ref(false)
const showControlShortcutBadges = ref(false)

let _unbindSearch: (() => void) | undefined
let _unbindMenuCommand: (() => void) | undefined
let _stopSidebarResize: (() => void) | undefined
let controlShortcutBadgeTimer: number | null = null

onMounted(async () => {
  _unbindSearch = search.bind()
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('keydown', onGlobalAppKeydown, true)
  window.addEventListener('keyup', onGlobalAppKeyup, true)
  window.addEventListener('blur', hideControlShortcutBadges)
  _unbindMenuCommand = window.ryte.app.onMenuCommand(handleMenuCommand)
  await Promise.all([settings.hydrate(), indexStatus.bind(), workspace.hydrate()])
  applySearchHistorySettings()

  await viewer.hydrate()
})

onUnmounted(() => {
  _unbindSearch?.()
  _unbindMenuCommand?.()
  _stopSidebarResize?.()
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('keydown', onGlobalAppKeydown, true)
  window.removeEventListener('keyup', onGlobalAppKeyup, true)
  window.removeEventListener('blur', hideControlShortcutBadges)
  clearControlShortcutBadgeTimer()
})

const dismissable = computed(() => true)
const activeSidebar = computed<WorkspaceSidebarMode>(() => workspace.shell.activeSidebar)
const sidebarAutoCollapsed = computed(() => workspace.sidebarAutoCollapsed(viewportWidth.value))
const sidebarCollapsed = computed(
  () => workspace.shell.sidebarCollapsed || sidebarAutoCollapsed.value || dragSidebarCollapsed.value
)
const sidebarWidth = computed(
  () => dragSidebarWidth.value ?? workspace.sidebarWidthForViewport(viewportWidth.value)
)
const appClasses = computed(() => ({
  'scrollbars-always-visible': settings.state?.scrollbarVisibility === 'always'
}))
const sidebarFrameStyle = computed(() => ({
  width: `${sidebarWidth.value}px`
}))
const sidebarPopoverStyle = computed(() => ({
  width: `${Math.min(sidebarWidth.value, Math.max(280, viewportWidth.value - 48))}px`
}))

watch(
  activeSidebar,
  (sidebar) => {
    if (sidebar === 'home') {
      hasActivatedHomeSidebar.value = true
    }
  },
  { immediate: true }
)

function openSearch(): void {
  search.$patch({
    answer: '',
    citations: [],
    error: null,
    notices: [],
    sources: [],
    status: 'idle'
  })
  showSearch.value = true
}

function openFileOpen(): void {
  showFileOpen.value = true
}

function openNativeFile(): void {
  void workspace.openNativeFile().catch(() => {
    // The workspace store owns the user-facing error state for failed opens.
  })
}

function openSettings(): void {
  showSettings.value = true
}

function closeActiveTab(): void {
  const tab = workspace.activeTab
  if (!tab) return

  void workspace.closeTabToRecent({ tabId: tab.id, sourcePath: tab.sourcePath }).catch(() => {
    // The workspace store owns the user-facing error state for failed closes.
  })
}

function closeAllTabs(): void {
  const tabs = [...workspace.tabs]
  void (async () => {
    for (const tab of tabs) {
      await workspace.closeTabToRecent({ tabId: tab.id, sourcePath: tab.sourcePath })
    }
  })().catch(() => {
    // The workspace store owns the user-facing error state for failed closes.
  })
}

function focusAdjacentTab(delta: 1 | -1): void {
  const tabs = workspace.tabs
  if (tabs.length === 0) return

  const activeIndex = tabs.findIndex((tab) => tab.id === workspace.activeTabId)
  const nextIndex = activeIndex === -1 ? 0 : (activeIndex + delta + tabs.length) % tabs.length
  const nextTab = tabs[nextIndex]
  if (!nextTab) return

  void workspace.focusTab({ tabId: nextTab.id }).catch(() => {
    // The workspace store owns the user-facing error state for failed tab focus.
  })
}

function closeSettings(): void {
  showSettings.value = false
  applySearchHistorySettings()
  // After saving settings the notesRoot may have changed — re-hydrate the tree.
  void viewer.hydrate()
}

function onWindowResize(): void {
  viewportWidth.value = window.innerWidth
  if (!sidebarAutoCollapsed.value) {
    sidebarPopoverOpen.value = false
  }
}

function toggleSidebar(): void {
  if (sidebarAutoCollapsed.value) {
    showSidebarPopover()
    return
  }
  void workspace.setSidebarCollapsed(!sidebarCollapsed.value)
}

function selectSidebar(activeSidebar: WorkspaceSidebarMode): void {
  if (sidebarAutoCollapsed.value) {
    void workspace.setActiveSidebar(activeSidebar)
    showSidebarPopover()
    return
  }

  void workspace.updateShell({
    activeSidebar,
    sidebarCollapsed: false
  })
}

function showSidebarPopover(): void {
  if (sidebarAutoCollapsed.value) {
    sidebarPopoverOpen.value = true
  }
}

function hideSidebarPopover(): void {
  sidebarPopoverOpen.value = false
}

function startSidebarResize(event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  let latestClientX = startX
  let resizeFrame: number | null = null
  dragSidebarWidth.value = startWidth
  dragSidebarCollapsed.value = false

  const applyMove = (): void => {
    resizeFrame = null
    const rawWidth = startWidth + latestClientX - startX
    const shouldCollapse = rawWidth < SIDEBAR_MIN_WIDTH
    dragSidebarCollapsed.value = shouldCollapse
    dragSidebarWidth.value = shouldCollapse
      ? SIDEBAR_MIN_WIDTH
      : clampSidebarWidth(rawWidth, viewportWidth.value)
  }

  const onMove = (moveEvent: PointerEvent): void => {
    latestClientX = moveEvent.clientX
    if (resizeFrame === null) {
      resizeFrame = window.requestAnimationFrame(applyMove)
    }
  }

  const onUp = (upEvent: PointerEvent): void => {
    const rawWidth = startWidth + upEvent.clientX - startX
    _stopSidebarResize?.()
    dragSidebarWidth.value = null
    dragSidebarCollapsed.value = false
    if (rawWidth < SIDEBAR_MIN_WIDTH) {
      void workspace.updateShell({ sidebarCollapsed: true })
      return
    }
    void workspace.updateShell({
      sidebarCollapsed: false,
      sidebarWidth: clampSidebarWidth(rawWidth, viewportWidth.value)
    })
  }

  _stopSidebarResize = () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = null
    }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    dragSidebarCollapsed.value = false
    _stopSidebarResize = undefined
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

function applySearchHistorySettings(): void {
  if (!settings.state) return
  search.configureHistory({
    retention: settings.state.searchHistoryRetention,
    includeAnswers: settings.state.searchHistoryIncludesAnswers
  })
}

function hasModalOpen(): boolean {
  return (
    showSearch.value ||
    showSettings.value ||
    showFileOpen.value ||
    document.querySelector('[aria-modal="true"]') !== null
  )
}

function clearControlShortcutBadgeTimer(): void {
  if (controlShortcutBadgeTimer === null) return
  window.clearTimeout(controlShortcutBadgeTimer)
  controlShortcutBadgeTimer = null
}

function scheduleControlShortcutBadges(): void {
  if (showControlShortcutBadges.value || controlShortcutBadgeTimer !== null) return

  controlShortcutBadgeTimer = window.setTimeout(() => {
    controlShortcutBadgeTimer = null
    showControlShortcutBadges.value = true
  }, 1000)
}

function hideControlShortcutBadges(): void {
  clearControlShortcutBadgeTimer()
  showControlShortcutBadges.value = false
}

function runAppShortcutAction(action: AppShortcutAction): void {
  if (action.type === 'focus-next-tab') {
    focusAdjacentTab(1)
    return
  }

  if (action.type === 'focus-previous-tab') {
    focusAdjacentTab(-1)
    return
  }

  if (action.type === 'select-sidebar') {
    selectSidebar(action.sidebar)
    return
  }

  if (action.type === 'toggle-sidebar') {
    toggleSidebar()
    return
  }

  if (action.type === 'open-search') {
    openSearch()
    return
  }

  if (action.type === 'open-file') {
    openFileOpen()
    return
  }

  if (action.type === 'open-native-file') {
    openNativeFile()
    return
  }

  openSettings()
}

function handleMenuCommand(command: AppMenuCommand): void {
  if (hasModalOpen()) return

  if (command.type === 'open-source-path') {
    void workspace.openExplicitFile({ sourcePath: command.sourcePath }).catch(() => {
      // The workspace store owns the user-facing error state for failed opens.
    })
    return
  }

  if (command.type === 'close-active-tab') {
    closeActiveTab()
    return
  }

  if (command.type === 'close-all-tabs') {
    closeAllTabs()
    return
  }

  if (command.type === 'focus-next-tab') {
    focusAdjacentTab(1)
    return
  }

  if (command.type === 'focus-previous-tab') {
    focusAdjacentTab(-1)
    return
  }

  runAppShortcutAction(command)
}

function onGlobalAppKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return

  const modalOpen = hasModalOpen()
  if (
    shouldScheduleControlShortcutBadges({
      key: event.key,
      defaultPrevented: event.defaultPrevented,
      modalOpen
    })
  ) {
    scheduleControlShortcutBadges()
    return
  }

  if (event.key === 'Control') return

  if (modalOpen) {
    hideControlShortcutBadges()
    return
  }

  const action = resolveAppShortcutAction({
    key: event.key,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    defaultPrevented: event.defaultPrevented,
    modalOpen
  })
  if (!action) return

  event.preventDefault()
  event.stopPropagation()
  hideControlShortcutBadges()
  runAppShortcutAction(action)
}

function onGlobalAppKeyup(event: KeyboardEvent): void {
  if (event.key === 'Control') {
    hideControlShortcutBadges()
  }
}
</script>

<template>
  <div class="app" :class="appClasses">
    <main class="app-main" :class="{ 'sidebar-is-collapsed': sidebarCollapsed }">
      <aside
        class="shell-sidebar"
        :class="{ collapsed: sidebarCollapsed }"
        aria-label="Primary navigation"
        @mouseenter="showSidebarPopover"
        @focusin="showSidebarPopover"
      >
        <div class="shell-chrome">
          <img class="app-logo" :src="ryteLogo" alt="ryte" draggable="false" />
        </div>

        <div class="shell-sidebar-body">
          <ShellRail
            :active-sidebar="activeSidebar"
            :sidebar-collapsed="sidebarCollapsed"
            :show-shortcut-badges="showControlShortcutBadges"
            @toggle-sidebar="toggleSidebar"
            @select-sidebar="selectSidebar"
            @open-file="openFileOpen"
            @open-search="openSearch"
            @open-settings="openSettings"
          />

          <section v-if="!sidebarCollapsed" class="sidebar-frame" :style="sidebarFrameStyle">
            <Sidebar v-show="activeSidebar === 'files'" @open-search="openSearch" />
            <HomeSidebar
              v-if="hasActivatedHomeSidebar"
              v-show="activeSidebar === 'home'"
              @open-search="openSearch"
            />
            <div
              class="sidebar-resize-handle"
              role="separator"
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              @pointerdown="startSidebarResize"
            />
          </section>
        </div>
      </aside>

      <aside
        v-if="sidebarAutoCollapsed && sidebarPopoverOpen"
        class="sidebar-popover"
        :style="sidebarPopoverStyle"
        @mouseleave="hideSidebarPopover"
      >
        <Sidebar v-show="activeSidebar === 'files'" @open-search="openSearch" />
        <HomeSidebar
          v-if="hasActivatedHomeSidebar"
          v-show="activeSidebar === 'home'"
          @open-search="openSearch"
        />
      </aside>

      <section class="workspace-region" aria-label="Workspace">
        <div class="workspace-top-rail">
          <WorkspaceTabs class="workspace-tabs-rail" />
        </div>
        <section class="workspace-pane">
          <Viewer />
        </section>
      </section>
    </main>

    <StatusBar />

    <FileOpenOverlay v-if="showFileOpen" @close="showFileOpen = false" />
    <SearchOverlay v-if="showSearch" @close="showSearch = false" />
    <SettingsModal v-if="showSettings" :dismissable="dismissable" @close="closeSettings" />
  </div>
</template>

<style scoped>
.app {
  --app-shell-tint: oklch(14.205% 0.00468 308.445 / 80%);
  --shell-chrome-height: 3.5rem;
  --shell-rail-width: 52px;

  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--app-shell-tint);
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.shell-sidebar {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  min-width: var(--shell-rail-width);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: visible;
  background: rgba(0, 0, 0, 0.1);
}

.shell-sidebar.collapsed {
  width: var(--shell-rail-width);
}

.shell-chrome {
  height: var(--shell-chrome-height);
  flex: 0 0 var(--shell-chrome-height);
  display: flex;
  align-items: center;
  padding-left: 6.25rem;
  -webkit-app-region: drag;
  user-select: none;
}

.app-logo {
  width: 40px;
  height: 22px;
  display: block;
  flex: 0 0 auto;
  margin-top: 4px;
  pointer-events: none;
}

.shell-sidebar-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

.app-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

.app-main::before {
  content: '';
  position: absolute;
  z-index: 5;
  top: calc(var(--shell-chrome-height) - 1px);
  right: 0;
  left: 0;
  height: 1px;
  pointer-events: none;
  background: oklch(100% 0 0 / 8%);
}

.sidebar-frame {
  position: relative;
  flex: 0 0 auto;
  min-width: 164px;
  max-width: 50vw;
  height: 100%;
  display: flex;
  overflow: hidden;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -10px;
  width: 20px;
  height: 100%;
  cursor: col-resize;
  -webkit-app-region: no-drag;
  touch-action: none;
  z-index: 3;
}

.sidebar-resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 7px;
  width: 6px;
}

.sidebar-resize-handle:hover::before {
  background: oklch(66.267% 0.18645 249.972 / 80%);
}

.sidebar-popover {
  position: absolute;
  z-index: 6;
  top: var(--shell-chrome-height);
  bottom: 0;
  left: var(--shell-rail-width);
  display: flex;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 16px 0 48px oklch(0% 0 0 / 34%);
}

.workspace-region {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-main:not(.sidebar-is-collapsed) .workspace-region {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.workspace-top-rail {
  height: var(--shell-chrome-height);
  flex: 0 0 var(--shell-chrome-height);
  display: flex;
  align-items: stretch;
  min-width: 0;
  background: transparent;
  -webkit-app-region: drag;
  user-select: none;
}

.app-main.sidebar-is-collapsed .workspace-top-rail {
  padding-left: calc(5.75rem + 72px - var(--shell-rail-width));
}

.workspace-tabs-rail {
  flex: 1 1 auto;
  min-width: 0;
}

.workspace-pane {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
