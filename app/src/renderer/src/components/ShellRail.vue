<script setup lang="ts">
import type { WorkspaceSidebarMode } from '../../../shared/workspace'
import IconHome from './icons/IconHome.vue'
import IconLibrary from './icons/IconLibrary.vue'
import IconPlus from './icons/IconPlus.vue'
import IconSearch from './icons/IconSearch.vue'
import IconSettings from './icons/IconSettings.vue'
import IconSidebar from './icons/IconSidebar.vue'
import IconSidebarOpen from './icons/IconSidebarOpen.vue'

const props = defineProps<{
  activeSidebar: WorkspaceSidebarMode
  sidebarCollapsed: boolean
  showShortcutBadges: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
  selectSidebar: [mode: WorkspaceSidebarMode]
  openFile: []
  openSearch: []
  openSettings: []
}>()

function sidebarToggleLabel(): string {
  return props.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'
}
</script>

<template>
  <nav class="shell-rail" aria-label="Workspace navigation">
    <div class="rail-top">
      <button
        v-if="sidebarCollapsed"
        type="button"
        class="rail-item"
        aria-label="Search"
        title="Search"
        aria-keyshortcuts="Meta+K"
        @click="emit('openSearch')"
      >
        <IconSearch />
      </button>

      <button
        type="button"
        class="rail-item"
        aria-label="Open file"
        title="Open file"
        aria-keyshortcuts="Meta+P"
        @click="emit('openFile')"
      >
        <IconPlus />
      </button>

      <button
        type="button"
        class="rail-item"
        data-workspace-fallback-focus
        :aria-label="sidebarToggleLabel()"
        :title="sidebarToggleLabel()"
        :aria-pressed="sidebarCollapsed"
        aria-keyshortcuts="Meta+B Control+T"
        @click="emit('toggleSidebar')"
      >
        <IconSidebarOpen v-if="sidebarCollapsed" />
        <IconSidebar v-else />
        <span v-if="showShortcutBadges" class="shortcut-badge" aria-hidden="true">T</span>
      </button>

      <button
        type="button"
        class="rail-item"
        :class="{ selected: activeSidebar === 'home' }"
        aria-label="Home"
        title="Home"
        :aria-current="activeSidebar === 'home' ? 'page' : undefined"
        aria-keyshortcuts="Meta+1 Control+1"
        @click="emit('selectSidebar', 'home')"
      >
        <IconHome />
        <span v-if="showShortcutBadges" class="shortcut-badge" aria-hidden="true">1</span>
      </button>

      <button
        type="button"
        class="rail-item"
        :class="{ selected: activeSidebar === 'files' }"
        aria-label="Library"
        title="Library"
        :aria-current="activeSidebar === 'files' ? 'page' : undefined"
        aria-keyshortcuts="Meta+2 Control+2"
        @click="emit('selectSidebar', 'files')"
      >
        <IconLibrary />
        <span v-if="showShortcutBadges" class="shortcut-badge" aria-hidden="true">2</span>
      </button>
    </div>

    <button
      type="button"
      class="rail-item rail-bottom"
      aria-label="Settings"
      title="Settings"
      aria-keyshortcuts="Meta+, Control+0"
      @click="emit('openSettings')"
    >
      <IconSettings />
      <span v-if="showShortcutBadges" class="shortcut-badge" aria-hidden="true">0</span>
    </button>
  </nav>
</template>

<style scoped>
.shell-rail {
  width: var(--shell-rail-width);
  height: 100%;
  display: flex;
  flex: 0 0 var(--shell-rail-width);
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px;
  color: rgba(255, 255, 255, 0.75);
  -webkit-app-region: no-drag;
}

.rail-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.rail-item {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  line-height: 1;
  transition-duration: 250ms;
  transition-property: background-color, color;
  transition-timing-function: ease-out;
}

.rail-item:hover,
.rail-item:focus-visible {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  outline: 0;
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.rail-item.selected {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}
.rail-item.selected:hover,
.rail-item.selected:focus-visible {
  background: rgba(255, 255, 255, 0.15);
}

.rail-item :deep(.ryte-svg-icon) {
  width: 18px;
  height: 18px;
}

.shortcut-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  z-index: 2;
  min-width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 5px;
  padding: 0 3px;
  background: rgba(232, 232, 238, 0.92);
  color: #201b25;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.rail-bottom {
  margin-top: auto;
}
</style>
