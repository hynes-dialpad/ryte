<script setup lang="ts">
import type { WorkspaceSidebarMode } from '../../../shared/workspace'
import IconHome from './icons/IconHome.vue'
import IconLibrary from './icons/IconLibrary.vue'
import IconSearch from './icons/IconSearch.vue'
import IconSettings from './icons/IconSettings.vue'
import IconSidebar from './icons/IconSidebar.vue'
import IconSidebarOpen from './icons/IconSidebarOpen.vue'

const props = defineProps<{
  activeSidebar: WorkspaceSidebarMode
  sidebarCollapsed: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
  selectSidebar: [mode: WorkspaceSidebarMode]
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
        type="button"
        class="rail-item"
        data-workspace-fallback-focus
        :aria-label="sidebarToggleLabel()"
        :title="sidebarToggleLabel()"
        :aria-pressed="sidebarCollapsed"
        @click="emit('toggleSidebar')"
      >
        <IconSidebarOpen v-if="sidebarCollapsed" />
        <IconSidebar v-else />
      </button>

      <button
        v-if="sidebarCollapsed"
        type="button"
        class="rail-item"
        aria-label="Search"
        title="Search"
        @click="emit('openSearch')"
      >
        <IconSearch />
      </button>

      <button
        type="button"
        class="rail-item"
        :class="{ selected: activeSidebar === 'home' }"
        aria-label="Home"
        title="Home"
        :aria-current="activeSidebar === 'home' ? 'page' : undefined"
        @click="emit('selectSidebar', 'home')"
      >
        <IconHome />
      </button>

      <button
        type="button"
        class="rail-item"
        :class="{ selected: activeSidebar === 'files' }"
        aria-label="Library"
        title="Library"
        :aria-current="activeSidebar === 'files' ? 'page' : undefined"
        @click="emit('selectSidebar', 'files')"
      >
        <IconLibrary />
      </button>
    </div>

    <button
      type="button"
      class="rail-item rail-bottom"
      aria-label="Settings"
      title="Settings"
      @click="emit('openSettings')"
    >
      <IconSettings />
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

.rail-bottom {
  margin-top: auto;
}
</style>
