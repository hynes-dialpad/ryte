<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useFileCatalogStore } from '../stores/file-catalog'
import { useWorkspaceStore } from '../stores/workspace'
import {
  buildFileOpenResults,
  resolveOpenResultScrollTop,
  type FileOpenResult
} from './file-open-model'
import IconFile from './icons/IconFile.vue'

const emit = defineEmits<{ close: [] }>()

const catalog = useFileCatalogStore()
const workspace = useWorkspaceStore()
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)
const query = ref('')
const selectedIndex = ref(0)
const openingSourcePath = ref<string | null>(null)
const openError = ref<string | null>(null)
const resultsListId = 'file-open-results'

const results = computed(() => buildFileOpenResults(catalog.files, query.value))
const selectedResult = computed(() => results.value[selectedIndex.value] ?? null)
const activeOptionId = computed(() =>
  selectedResult.value ? resultOptionId(selectedIndex.value) : undefined
)
const emptyResultsLabel = computed(() =>
  catalog.files.length === 0 ? 'No files indexed' : `No matches for "${query.value.trim()}"`
)

watch(results, (nextResults) => {
  if (selectedIndex.value >= nextResults.length) {
    selectedIndex.value = Math.max(0, nextResults.length - 1)
  }
})

watch(query, () => {
  selectedIndex.value = 0
  openError.value = null
  void nextTick(scrollSelectedResultIntoView)
})

watch(selectedIndex, () => {
  void nextTick(scrollSelectedResultIntoView)
})

onMounted(async () => {
  await catalog.hydrate()
  await nextTick()
  inputRef.value?.focus()
})

onUnmounted(() => {
  catalog.unbind()
})

function moveSelection(delta: number): void {
  if (results.value.length === 0) return
  selectedIndex.value = (selectedIndex.value + delta + results.value.length) % results.value.length
}

function setSelection(index: number): void {
  if (results.value.length === 0) return
  selectedIndex.value = Math.min(Math.max(index, 0), results.value.length - 1)
}

function resultOptionId(index: number): string {
  return `file-open-result-${index}`
}

function scrollSelectedResultIntoView(): void {
  const container = resultsRef.value
  const selectedItem = container?.children.item(selectedIndex.value) as HTMLElement | null
  if (!container || !selectedItem) return

  const containerRect = container.getBoundingClientRect()
  const selectedItemRect = selectedItem.getBoundingClientRect()
  const nextScrollTop = resolveOpenResultScrollTop({
    currentScrollTop: container.scrollTop,
    viewportHeight: container.clientHeight,
    itemTop: container.scrollTop + selectedItemRect.top - containerRect.top,
    itemHeight: selectedItemRect.height
  })

  if (nextScrollTop !== container.scrollTop) {
    container.scrollTop = nextScrollTop
  }
}

async function openResult(result: FileOpenResult | null): Promise<void> {
  if (openingSourcePath.value) return
  if (!result) return

  openError.value = null
  openingSourcePath.value = result.sourcePath

  try {
    await workspace.openExplicitFile({ sourcePath: result.sourcePath })
    emit('close')
  } catch (e) {
    openError.value = e instanceof Error ? e.message : 'Unable to open file'
  } finally {
    openingSourcePath.value = null
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveSelection(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelection(-1)
    return
  }

  if (event.key === 'Home') {
    event.preventDefault()
    setSelection(0)
    return
  }

  if (event.key === 'End') {
    event.preventDefault()
    setSelection(results.value.length - 1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    void openResult(selectedResult.value)
  }
}
</script>

<template>
  <div class="open-backdrop" @click.self="emit('close')">
    <section class="open-panel" role="dialog" aria-modal="true" aria-label="Open file">
      <div class="open-input-shell">
        <input
          ref="inputRef"
          v-model="query"
          class="open-input"
          type="text"
          role="combobox"
          placeholder="Open file"
          aria-label="Open file"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="results.length > 0 ? resultsListId : undefined"
          :aria-activedescendant="activeOptionId"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
      </div>

      <div v-if="openError" class="open-state error open-error" role="alert">{{ openError }}</div>
      <div v-if="catalog.loading && results.length === 0" class="open-state">Loading files...</div>
      <div v-else-if="catalog.error" class="open-state error">{{ catalog.error }}</div>
      <div v-else-if="results.length === 0" class="open-state">{{ emptyResultsLabel }}</div>

      <ul
        v-else
        :id="resultsListId"
        ref="resultsRef"
        class="open-results ryte-scrollbar ryte-scrollbar--y"
        role="listbox"
        aria-label="Files"
      >
        <li
          v-for="(result, index) in results"
          :id="resultOptionId(index)"
          :key="result.sourcePath"
          class="open-result"
          :class="{
            selected: index === selectedIndex,
            opening: openingSourcePath === result.sourcePath
          }"
          role="option"
          :aria-selected="index === selectedIndex"
          :aria-disabled="openingSourcePath !== null"
          @mousedown.prevent
          @mouseenter="selectedIndex = index"
          @click="openResult(result)"
        >
          <IconFile />
          <span class="result-copy">
            <span class="result-title">{{ result.title }}</span>
            <span class="result-path">{{ result.sourcePath }}</span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.open-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  padding: 12vh 24px 24px;
  background: rgba(0, 0, 0, 0.38);
  -webkit-app-region: no-drag;
}

.open-panel {
  width: min(640px, calc(100vw - 48px));
  max-height: min(680px, 76vh);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(30, 29, 31, 0.98);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.36);
}

.open-input-shell {
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.open-input {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.88);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.open-input:focus {
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow: 0 0 0 1px rgba(4, 150, 255, 0.7);
}

.open-results {
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 8px;
}

.open-result {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  gap: 10px;
  border: 0;
  border-radius: 8px;
  padding: 7px 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.76);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.open-result.selected,
.open-result:hover,
.open-result:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  outline: 0;
}

.open-result.selected {
  box-shadow: inset 0 0 0 1px rgba(4, 150, 255, 0.9);
}

.open-result.opening {
  cursor: default;
  opacity: 0.72;
}

.open-result :deep(.ryte-svg-icon) {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.result-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.result-title,
.result-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-title {
  font-size: 13px;
  line-height: 1.25;
}

.result-path {
  color: rgba(255, 255, 255, 0.42);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.25;
}

.open-state {
  padding: 18px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

.open-state.error {
  color: #ff9c9c;
}

.open-error {
  padding-bottom: 0;
}
</style>
