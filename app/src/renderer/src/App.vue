<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import SettingsModal from './components/SettingsModal.vue'
import Sidebar from './components/Sidebar.vue'
import StatusBar from './components/StatusBar.vue'
import Viewer from './components/Viewer.vue'
import { useIndexStatusStore } from './stores/index-status'
import { useSettingsStore } from './stores/settings'
import { useViewerStore } from './stores/viewer'

const settings = useSettingsStore()
const indexStatus = useIndexStatusStore()
const viewer = useViewerStore()
const showSettings = ref(false)

onMounted(async () => {
  await Promise.all([settings.hydrate(), indexStatus.bind()])
  if (!settings.state?.hasOpenAIKey) {
    showSettings.value = true
  } else {
    if (indexStatus.status.phase === 'idle' && indexStatus.status.chunksTotal === 0) {
      // Cold launch with credentials but empty index — start indexing automatically.
      void indexStatus.triggerReindex()
    }
    // Hydrate the file tree for the viewer (requires a configured notesRoot).
    await viewer.hydrate()
  }
})

const dismissable = computed(() => settings.state?.hasOpenAIKey ?? false)

function openSettings(): void {
  showSettings.value = true
}

function closeSettings(): void {
  showSettings.value = false
  // After saving settings the notesRoot may have changed — re-hydrate the tree.
  if (settings.state?.hasOpenAIKey) {
    void viewer.hydrate()
  }
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>ryte</h1>
      <button type="button" class="settings-btn" @click="openSettings">Settings</button>
    </header>

    <main class="app-main">
      <Sidebar />
      <Viewer />
    </main>

    <StatusBar />

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
