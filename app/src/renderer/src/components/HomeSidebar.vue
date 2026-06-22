<script setup lang="ts">
import { computed } from 'vue'

import { useWorkspaceStore } from '../stores/workspace'
import { buildHomeSidebarModel } from './home-sidebar-model'
import SidebarSearchButton from './SidebarSearchButton.vue'

const emit = defineEmits<{
  openSearch: []
}>()

const workspace = useWorkspaceStore()
const model = computed(() =>
  buildHomeSidebarModel({
    recents: workspace.recents,
    tabs: workspace.tabs,
    activeTabId: workspace.activeTabId
  })
)

function openRecent(sourcePath: string): void {
  void workspace.openOrFocusFile({ sourcePath })
}

function focusOpenTab(tabId: string): void {
  void workspace.focusTab({ tabId })
}
</script>

<template>
  <nav class="home-sidebar ryte-scrollbar ryte-scrollbar--y" aria-label="Home sidebar">
    <div class="home-search">
      <SidebarSearchButton @search="emit('openSearch')" />
    </div>

    <section class="home-section" aria-labelledby="home-recent-heading">
      <h2 id="home-recent-heading" class="home-heading">Recent</h2>
      <p v-if="model.recentItems.length === 0" class="home-empty">No recent files</p>
      <ul v-else class="home-list">
        <li v-for="item in model.recentItems" :key="item.id">
          <button
            type="button"
            class="home-row"
            :class="{ active: item.active }"
            :title="item.sourcePath"
            :aria-current="item.active ? 'page' : undefined"
            :aria-label="`Open ${item.sourcePath}`"
            @click="openRecent(item.sourcePath)"
          >
            <span class="row-marker" aria-hidden="true"></span>
            <span class="row-copy">
              <span class="row-title">{{ item.title }}</span>
              <span class="row-path">{{ item.sourcePath }}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <section class="home-section" aria-labelledby="home-open-heading">
      <h2 id="home-open-heading" class="home-heading">Open</h2>
      <p v-if="model.openItems.length === 0" class="home-empty">No open files</p>
      <ul v-else class="home-list">
        <li v-for="item in model.openItems" :key="item.id">
          <button
            type="button"
            class="home-row"
            :class="{ active: item.active }"
            :title="item.sourcePath"
            :aria-current="item.active ? 'page' : undefined"
            :aria-label="`Focus ${item.sourcePath}`"
            @click="focusOpenTab(item.tabId)"
          >
            <span class="row-marker" aria-hidden="true"></span>
            <span class="row-copy">
              <span class="row-title">{{ item.title }}</span>
              <span class="row-path">{{ item.sourcePath }}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  </nav>
</template>

<style scoped>
.home-sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  background: rgba(0, 0, 0, 0.1);
  font-size: 0.825rem;
}

.home-sidebar:focus-within {
  outline: none;
}

.home-search {
  padding: 10px 12px 12px;
}

.home-section {
  padding: 4px 8px 14px;
}

.home-heading {
  margin: 0 0 6px;
  padding: 0 6px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.2;
  text-transform: uppercase;
}

.home-empty {
  margin: 0;
  padding: 8px 6px 10px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.78rem;
  line-height: 1.35;
}

.home-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.home-row {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.home-row:hover,
.home-row:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  outline: 0;
}

.home-row.active {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.row-marker {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 999px;
  background: transparent;
}

.home-row.active .row-marker {
  background: currentColor;
}

.row-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.row-title,
.row-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title {
  color: inherit;
  font-size: 0.82rem;
  line-height: 1.15;
}

.row-path {
  color: rgba(255, 255, 255, 0.42);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.67rem;
  line-height: 1.15;
}

.home-row:hover .row-path,
.home-row:focus-visible .row-path,
.home-row.active .row-path {
  color: rgba(255, 255, 255, 0.62);
}
</style>
