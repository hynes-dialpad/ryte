<script setup lang="ts">
import { computed } from 'vue'

import { useIndexStatusStore } from '../stores/index-status'

const indexStatus = useIndexStatusStore()

const message = computed(() => {
  const s = indexStatus.status
  switch (s.phase) {
    case 'idle':
      return ''
    case 'walking':
      return 'Walking notes…'
    case 'indexing': {
      const total = s.chunksTotal || '?'
      return `Indexing ${s.chunksDone}/${total} chunks · ${s.filesDone}/${s.filesTotal} files`
    }
    case 'done':
      if (s.chunksTotal === 0 && s.filesTotal === 0) return ''
      return `Index ready: ${s.chunksTotal} chunks across ${s.filesTotal} files`
    case 'error':
      return `Indexing error: ${s.error ?? 'unknown'}`
    default:
      return ''
  }
})

const tone = computed(() => {
  switch (indexStatus.status.phase) {
    case 'indexing':
    case 'walking':
      return 'busy'
    case 'error':
      return 'error'
    case 'done':
      return 'ready'
    default:
      return 'idle'
  }
})
</script>

<template>
  <footer class="status-bar" :class="`tone-${tone}`">
    <span class="status-text">{{ message }}</span>
  </footer>
</template>

<style scoped>
.status-bar {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 0.875rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.status-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-bar.tone-busy {
  color: #6db4ff;
}

.status-bar.tone-error {
  color: #ff9494;
  background: rgba(180, 40, 40, 0.18);
}

.status-bar.tone-ready {
  color: rgba(140, 230, 160, 0.9);
}
</style>
