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

const settings = useSettingsStore()
const indexStatus = useIndexStatusStore()
const viewer = useViewerStore()
const search = useSearchStore()
const showSettings = ref(false)
const showSearch = ref(false)

let _unbindSearch: (() => void) | undefined

onMounted(async () => {
  _unbindSearch = search.bind()
  await Promise.all([settings.hydrate(), indexStatus.bind()])
  applySearchHistorySettings()

  if (indexStatus.status.phase === 'idle' && indexStatus.status.chunksTotal === 0) {
    void indexStatus.triggerReindex()
  }
  await viewer.hydrate()
})

onUnmounted(() => _unbindSearch?.())

const dismissable = computed(() => true)

function openSearch(): void {
  search.$patch({ answer: '', citations: [], status: 'idle', error: null })
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
        <button type="button" class="search-trigger-btn" @click="openSearch">Search</button>
        <button type="button" class="settings-btn" @click="openSettings">Settings</button>
      </div>
    </header>

    <main class="app-main">
      <Sidebar />
      <Viewer />
    </main>

    <StatusBar />

    <SearchOverlay v-if="showSearch" @close="showSearch = false" />
    <SettingsModal v-if="showSettings" :dismissable="dismissable" @close="closeSettings" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.search-trigger-btn {
  background: transparent;
  color: var(--color-text);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 0.3rem 0.7rem;
  font-size: 0.825rem;
  cursor: pointer;
  font-family: inherit;
}

.search-trigger-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.settings-btn {
  background: transparent;
  color: var(--color-text);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 0.3rem 0.7rem;
  font-size: 0.825rem;
  cursor: pointer;
  font-family: inherit;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  min-height: 0;
}
</style>
