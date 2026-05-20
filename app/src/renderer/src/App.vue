<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import SearchOverlay from './components/SearchOverlay.vue'
import SettingsModal from './components/SettingsModal.vue'
import Sidebar from './components/Sidebar.vue'
import StatusBar from './components/StatusBar.vue'
import Viewer from './components/Viewer.vue'
import { useIndexStatusStore } from './stores/index-status'
import { useSearchStore } from './stores/search'
import { useSettingsStore } from './stores/settings'
import { useViewerStore } from './stores/viewer'
import { useWorkspaceStore } from './stores/workspace'
import {
  SIDEBAR_EDGE_TARGET_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth
} from '../../shared/workspace'

const settings = useSettingsStore()
const indexStatus = useIndexStatusStore()
const viewer = useViewerStore()
const search = useSearchStore()
const workspace = useWorkspaceStore()
const showSettings = ref(false)
const showSearch = ref(false)
const viewportWidth = ref(window.innerWidth)
const dragSidebarWidth = ref<number | null>(null)
const sidebarPopoverOpen = ref(false)

let _unbindSearch: (() => void) | undefined
let _stopSidebarResize: (() => void) | undefined

onMounted(async () => {
  _unbindSearch = search.bind()
  window.addEventListener('resize', onWindowResize)
  await Promise.all([settings.hydrate(), indexStatus.bind(), workspace.hydrate()])
  applySearchHistorySettings()

  await viewer.hydrate()
})

onUnmounted(() => {
  _unbindSearch?.()
  _stopSidebarResize?.()
  window.removeEventListener('resize', onWindowResize)
})

const dismissable = computed(() => true)
const sidebarAutoCollapsed = computed(() => workspace.sidebarAutoCollapsed(viewportWidth.value))
const sidebarCollapsed = computed(
  () => workspace.shell.sidebarCollapsed || sidebarAutoCollapsed.value
)
const sidebarWidth = computed(
  () => dragSidebarWidth.value ?? workspace.sidebarWidthForViewport(viewportWidth.value)
)
const sidebarFrameStyle = computed(() => ({
  width: `${sidebarWidth.value}px`
}))
const sidebarPopoverStyle = computed(() => ({
  width: `${Math.min(sidebarWidth.value, Math.max(280, viewportWidth.value - 48))}px`
}))
const edgeTargetStyle = computed(() => ({
  width: `${SIDEBAR_EDGE_TARGET_WIDTH}px`
}))

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

function openSettings(): void {
  showSettings.value = true
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
  void workspace.setSidebarCollapsed(!workspace.shell.sidebarCollapsed)
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
  dragSidebarWidth.value = startWidth

  const onMove = (moveEvent: PointerEvent): void => {
    const rawWidth = startWidth + moveEvent.clientX - startX
    dragSidebarWidth.value =
      rawWidth < SIDEBAR_MIN_WIDTH
        ? SIDEBAR_MIN_WIDTH
        : clampSidebarWidth(rawWidth, viewportWidth.value)
  }

  const onUp = (upEvent: PointerEvent): void => {
    const rawWidth = startWidth + upEvent.clientX - startX
    _stopSidebarResize?.()
    dragSidebarWidth.value = null
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
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
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
</script>

<template>
  <div class="app" tabindex="0" @keydown.meta.k.prevent="openSearch">
    <header class="app-header">
      <h1>ryte</h1>
      <div class="header-actions">
        <button type="button" class="sidebar-header-btn" @click="toggleSidebar">
          {{ workspace.shell.sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar' }}
        </button>
        <button type="button" class="search-trigger-btn" @click="openSearch">Search</button>
        <button type="button" class="settings-btn" @click="openSettings">Settings</button>
      </div>
    </header>

    <main class="app-main" :class="{ 'sidebar-is-collapsed': sidebarCollapsed }">
      <section v-if="!sidebarCollapsed" class="sidebar-frame" :style="sidebarFrameStyle">
        <button type="button" class="sidebar-toggle-btn" @click="toggleSidebar">
          Hide sidebar
        </button>
        <Sidebar />
        <div
          class="sidebar-resize-handle"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          @pointerdown="startSidebarResize"
        />
      </section>

      <button
        v-else-if="!sidebarAutoCollapsed"
        type="button"
        class="sidebar-restore-btn"
        @click="toggleSidebar"
      >
        Show sidebar
      </button>

      <div
        v-if="sidebarAutoCollapsed"
        class="sidebar-edge-target"
        :style="edgeTargetStyle"
        @mouseenter="showSidebarPopover"
        @focusin="showSidebarPopover"
      >
        <button type="button" class="sidebar-edge-btn" @click="showSidebarPopover">
          Show sidebar
        </button>
      </div>

      <aside
        v-if="sidebarAutoCollapsed && sidebarPopoverOpen"
        class="sidebar-popover"
        :style="sidebarPopoverStyle"
        @mouseleave="hideSidebarPopover"
      >
        <Sidebar />
      </aside>

      <Viewer />
    </main>

    <StatusBar />

    <SearchOverlay v-if="showSearch" @close="showSearch = false" />
    <SettingsModal v-if="showSettings" :dismissable="dismissable" @close="closeSettings" />
  </div>
</template>

<style scoped>
.app {
  --app-shell-tint: oklch(14.205% 0.00468 308.445 / 80%);

  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--app-shell-tint);
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.625rem 1rem 0.625rem 5.75rem;
  background: transparent;
  border-bottom: 1px solid oklch(100% 0 0 / 8%);
  flex-shrink: 0;
  -webkit-app-region: drag;
  user-select: none;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  -webkit-app-region: no-drag;
}

.search-trigger-btn,
.settings-btn,
.sidebar-header-btn {
  background: transparent;
  color: var(--color-text);
  border: 1px solid oklch(100% 0 0 / 18%);
  border-radius: 4px;
  padding: 0.3rem 0.7rem;
  font-size: 0.825rem;
  cursor: pointer;
  font-family: inherit;
  -webkit-app-region: no-drag;
}

.search-trigger-btn:hover,
.settings-btn:hover,
.sidebar-header-btn:hover {
  background: oklch(100% 0 0 / 6%);
}

h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  min-height: 0;
  position: relative;
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

.sidebar-toggle-btn {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  z-index: 2;
  background: oklch(8% 0.006 300 / 72%);
  color: oklch(100% 0 0 / 76%);
  border: 1px solid oklch(100% 0 0 / 14%);
  border-radius: 4px;
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -10px;
  width: 20px;
  height: 100%;
  cursor: col-resize;
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

.sidebar-restore-btn {
  flex: 0 0 32px;
  writing-mode: vertical-rl;
  background: oklch(8% 0.006 300 / 64%);
  color: oklch(100% 0 0 / 72%);
  border: 0;
  border-right: 1px solid oklch(100% 0 0 / 10%);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.sidebar-edge-target {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 4;
}

.sidebar-edge-btn {
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: transparent;
  cursor: default;
}

.sidebar-popover {
  position: absolute;
  z-index: 6;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  overflow: hidden;
  box-shadow: 16px 0 48px oklch(0% 0 0 / 34%);
}
</style>
