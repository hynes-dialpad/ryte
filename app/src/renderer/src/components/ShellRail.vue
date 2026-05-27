<script setup lang="ts">
import type { WorkspaceSidebarMode } from '../../../shared/workspace'

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
        <svg
          v-if="sidebarCollapsed"
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 18 18"
          aria-hidden="true"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-opacity=".75"
            stroke-width="1.5"
            d="M6.75 2.25v13.5m3.75-9L12.75 9l-2.25 2.25m-6.75-9h10.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V3.75a1.5 1.5 0 0 1 1.5-1.5"
          />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 18 18"
          aria-hidden="true"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-opacity=".75"
            stroke-width="1.5"
            d="M6.75 2.25v13.5m-3-13.5h10.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V3.75a1.5 1.5 0 0 1 1.5-1.5"
          />
        </svg>
      </button>

      <button
        v-if="sidebarCollapsed"
        type="button"
        class="rail-item"
        aria-label="Search"
        title="Search"
        @click="emit('openSearch')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 18 18"
          aria-hidden="true"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-opacity=".75"
            stroke-width="1.5"
            d="m15.75 15.75-3.262-3.262M14.25 8.25a6 6 0 1 1-12 0 6 6 0 0 1 12 0"
          />
        </svg>
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 18 18"
          aria-hidden="true"
        >
          <g clip-path="url(#shell-rail-home)">
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-opacity=".75"
              stroke-width="1.5"
              d="M6.75 16.5V9h4.5v7.5m-9-9.75L9 1.5l6.75 5.25V15a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5z"
            />
          </g>
          <defs>
            <clipPath id="shell-rail-home"><path fill="#fff" d="M0 0h18v18H0z" /></clipPath>
          </defs>
        </svg>
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 18 18"
          aria-hidden="true"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-opacity=".75"
            stroke-width="1.5"
            d="M12 4.5 15 15M9 4.5V15M6 6v9M3 3v12"
          />
        </svg>
      </button>
    </div>

    <button
      type="button"
      class="rail-item rail-bottom"
      aria-label="Settings"
      title="Settings"
      @click="emit('openSettings')"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        fill="none"
        viewBox="0 0 18 18"
        aria-hidden="true"
      >
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-opacity=".75"
          stroke-width="1.5"
          d="M7.342 2.095c.421-1.793 2.895-1.793 3.316 0a1.7 1.7 0 0 0 2.536 1.052c1.566-.97 3.315.78 2.344 2.345a1.7 1.7 0 0 0 1.052 2.536c1.793.421 1.793 2.895 0 3.316a1.7 1.7 0 0 0-1.052 2.536c.97 1.566-.778 3.315-2.344 2.344a1.7 1.7 0 0 0-2.536 1.052c-.421 1.793-2.895 1.793-3.316 0a1.7 1.7 0 0 0-2.536-1.052c-1.566.97-3.315-.778-2.344-2.344a1.7 1.7 0 0 0-1.052-2.536c-1.793-.421-1.793-2.895 0-3.316a1.7 1.7 0 0 0 1.052-2.536c-.97-1.566.778-3.315 2.344-2.344A1.7 1.7 0 0 0 7.342 2.095"
        />
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-opacity=".75"
          stroke-width="1.5"
          d="M9 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5"
        />
      </svg>
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
  padding: 0 4px 8px;
  color: rgba(255, 255, 255, 0.75);
  -webkit-app-region: no-drag;
}

.rail-top {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 34px;
}

.rail-item {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  padding: 8px;
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
  background: rgba(17, 17, 17, 0.72);
  color: #ffffff;
  outline: 0;
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.rail-item.selected {
  background: rgba(17, 17, 17, 0.9);
  color: #ffffff;
}

.rail-item svg {
  width: 18px;
  height: 18px;
  display: block;
  flex: 0 0 auto;
}

.rail-bottom {
  margin-top: auto;
}
</style>
