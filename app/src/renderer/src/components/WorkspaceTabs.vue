<script setup lang="ts">
import { computed } from 'vue'

import { useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()

const hasTabs = computed(() => workspace.tabs.length > 0)

function focusTab(tabId: string): void {
  if (workspace.activeTabId === tabId) return
  void workspace.focusTab({ tabId })
}

function closeTab(event: MouseEvent, tabId: string): void {
  event.stopPropagation()
  void workspace.closeTab({ tabId })
}
</script>

<template>
  <nav v-if="hasTabs" class="workspace-tabs" aria-label="Open files">
    <div class="tab-list" role="tablist" aria-label="Workspace tabs">
      <div
        v-for="tab in workspace.tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: workspace.activeTabId === tab.id }"
      >
        <button
          type="button"
          class="tab-focus"
          role="tab"
          :aria-selected="workspace.activeTabId === tab.id"
          :title="tab.sourcePath"
          @click="focusTab(tab.id)"
        >
          <span class="tab-title">{{ tab.title }}</span>
        </button>
        <button
          type="button"
          class="tab-close"
          :aria-label="`Close ${tab.title}`"
          :title="`Close ${tab.title}`"
          @click="closeTab($event, tab.id)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 14 14"
            aria-hidden="true"
          >
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.25"
              d="m10.5 3.5-7 7m0-7 7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.workspace-tabs {
  flex: 1 1 auto;
  align-self: stretch;
  display: flex;
  align-items: stretch;
  min-width: 0;
  padding-block-start: 8px;
  padding-inline-end: 16px;
  background: transparent;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.tab-list {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.tab-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 calc(9.6rem + 52px);
  min-width: 144px;
  max-width: calc(9.6rem + 52px);
  padding: 8px 8px 8px 16px;
  border-radius: 8px;
  background: rgba(10, 9, 11, 0);
  color: rgba(255, 255, 255, 0.75);
  transition-duration: 250ms;
  transition-property: background-color, color;
  transition-timing-function: ease-out;
}

.tab-item.active {
  color: #ffffff;
  background: rgba(10, 9, 11, 0.25);
}

.tab-focus {
  min-width: 0;
  flex: 0 1 auto;
  display: inline-flex;
  align-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.76rem;
  line-height: 120%;
  cursor: pointer;
}

.tab-focus:focus-visible,
.tab-close:focus-visible {
  outline: 2px solid rgba(120, 200, 255, 0.65);
  outline-offset: -2px;
}

.tab-item:hover {
  background: rgba(10, 9, 11, 0.35);
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.tab-item.active:hover {
  background: rgba(10, 9, 11, 0.35);
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.tab-title {
  display: block;
  min-width: 0;
  max-width: 9.6rem;
  direction: rtl;
  overflow: hidden;
  line-height: 120%;
  text-align: left;
  text-overflow: ellipsis;
  unicode-bidi: plaintext;
  white-space: nowrap;
}

.tab-close {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  padding: 4px;
  background: rgba(10, 9, 11, 0);
  color: rgba(255, 255, 255, 0.5);
  font: inherit;
  line-height: 120%;
  cursor: pointer;
}

.tab-item.active .tab-close {
  color: #ffffff;
}

.tab-close:hover {
  color: #ffffff;
  background: rgba(10, 9, 11, 0.9);
}

.tab-close svg {
  width: 14px;
  height: 14px;
  display: block;
}
</style>
