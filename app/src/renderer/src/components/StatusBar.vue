<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useIndexStatusStore } from '../stores/index-status'

const indexStatus = useIndexStatusStore()
const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

watch(
  () => indexStatus.status.phase,
  (phase) => {
    clearHideTimer()
    if (phase === 'walking' || phase === 'indexing' || phase === 'error') {
      visible.value = true
    } else if (phase === 'done') {
      const s = indexStatus.status
      if (s.chunksTotal === 0 && s.filesTotal === 0) {
        visible.value = false
        return
      }
      visible.value = true
      hideTimer = setTimeout(() => {
        visible.value = false
        hideTimer = null
      }, 4000)
    } else {
      // idle
      visible.value = false
    }
  },
  { immediate: true }
)

const message = computed(() => {
  const s = indexStatus.status
  switch (s.phase) {
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
  <footer class="status-bar" :class="[`tone-${tone}`, { hidden: !visible }]">
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
  overflow: hidden;
  transition:
    height 350ms ease,
    opacity 350ms ease;
}

.status-bar.hidden {
  height: 0;
  opacity: 0;
  border-top-color: transparent;
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
