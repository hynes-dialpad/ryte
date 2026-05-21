<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { render } from '../markdown/renderer'
import { useSearchStore } from '../stores/search'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'
import type { SearchQueryOptions, SearchRetrievalMode } from '../../../preload/index'

const emit = defineEmits<{ close: [] }>()

const search = useSearchStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const RETRIEVAL_MODES: SearchRetrievalMode[] = ['auto', 'keyword', 'hybrid']

const inputRef = ref<HTMLInputElement | null>(null)
const localQuery = ref('')
const renderedAnswer = ref('')
const pendingCloudQuery = ref('')
const showCloudWarning = ref(false)
const retrievalMode = ref<SearchRetrievalMode>('auto')
const generatedAnswersEnabled = ref(true)

const retrievalLabel = computed(() => {
  const mode = search.sources[0]?.retrievalMode ?? retrievalMode.value
  if (mode === 'hybrid') return 'Hybrid'
  if (mode === 'keyword') return 'Keyword'
  return 'Auto'
})

watch(
  () => search.answer,
  async (md) => {
    renderedAnswer.value = md ? await render(md) : ''
  }
)

watch(
  () => true,
  async () => {
    await nextTick()
    inputRef.value?.focus()
  },
  { immediate: true }
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') void closeOverlay()
}

async function submit(): Promise<void> {
  if (!localQuery.value.trim() || search.status === 'searching' || search.status === 'streaming')
    return
  if (!settings.state) await settings.hydrate()
  const q = localQuery.value.trim()
  if (
    generatedAnswersEnabled.value &&
    settings.state?.cloudAnswersEnabled &&
    !hasCurrentCloudAcknowledgement()
  ) {
    pendingCloudQuery.value = q
    showCloudWarning.value = true
    return
  }
  await search.runQuery(q, searchOptions())
}

async function continueWithCloud(): Promise<void> {
  const q = pendingCloudQuery.value
  if (!q) return
  if (!settings.state) return
  await settings.save({
    cloudAnswersAcknowledgement: {
      acknowledgedAt: new Date().toISOString(),
      provider: settings.state.answerProvider,
      model: settings.state.answerModel
    }
  })
  showCloudWarning.value = false
  pendingCloudQuery.value = ''
  await search.runQuery(q, searchOptions())
}

async function searchLocallyOnly(): Promise<void> {
  const q = pendingCloudQuery.value
  if (!q) return
  showCloudWarning.value = false
  pendingCloudQuery.value = ''
  generatedAnswersEnabled.value = false
  await search.runQuery(q, searchOptions('local-only'))
}

function openCitation(sourcePath: string): void {
  void workspace.openFile({ sourcePath })
  void closeOverlay()
}

function formatPath(sourcePath: string, headingPath: string[]): string {
  return headingPath.length ? `${sourcePath} › ${headingPath.join(' › ')}` : sourcePath
}

function searchOptions(answerMode?: SearchQueryOptions['answerMode']): SearchQueryOptions {
  return {
    retrievalMode: retrievalMode.value,
    answerMode: answerMode ?? (generatedAnswersEnabled.value ? 'settings' : 'local-only')
  }
}

function hasCurrentCloudAcknowledgement(): boolean {
  const s = settings.state
  return (
    !!s?.cloudAnswersAcknowledgement &&
    s.cloudAnswersAcknowledgement.provider === s.answerProvider &&
    s.cloudAnswersAcknowledgement.model === s.answerModel
  )
}

async function closeOverlay(): Promise<void> {
  if (search.status === 'searching' || search.status === 'streaming') {
    await search.cancel()
  }
  emit('close')
}
</script>

<template>
  <div class="search-backdrop" @click.self="closeOverlay" @keydown="onKeydown">
    <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search notes">
      <!-- Input row -->
      <div class="search-input-row">
        <input
          ref="inputRef"
          v-model="localQuery"
          class="search-input"
          type="text"
          placeholder="Ask anything about your notes…"
          @keydown.enter="submit"
          @keydown.esc="closeOverlay"
        />
        <button
          class="search-btn"
          :disabled="
            !localQuery.trim() || search.status === 'searching' || search.status === 'streaming'
          "
          @click="submit"
        >
          {{ search.status === 'searching' || search.status === 'streaming' ? '…' : '↵' }}
        </button>
      </div>

      <div class="search-controls" aria-label="Search controls">
        <div class="segmented-control" role="radiogroup" aria-label="Retrieval mode">
          <button
            v-for="mode in RETRIEVAL_MODES"
            :key="mode"
            type="button"
            :class="{ active: retrievalMode === mode }"
            :aria-pressed="retrievalMode === mode"
            @click="retrievalMode = mode"
          >
            {{ mode === 'auto' ? 'Auto' : mode === 'keyword' ? 'Keyword' : 'Hybrid' }}
          </button>
        </div>
        <label class="answer-toggle">
          <input v-model="generatedAnswersEnabled" type="checkbox" />
          <span>Generated answer</span>
        </label>
      </div>

      <div v-if="showCloudWarning" class="cloud-warning" role="alertdialog" aria-live="assertive">
        <p>
          This is the first time Ryte will send note content outside your Mac. Ryte will send this
          query and selected matching excerpts to your configured model provider. Local keyword
          search remains available without sending data.
        </p>
        <div class="cloud-warning-actions">
          <button type="button" @click="searchLocallyOnly">Search locally</button>
          <button type="button" class="primary-action" @click="continueWithCloud">Continue</button>
        </div>
      </div>

      <!-- Current result -->
      <template v-if="search.status !== 'idle' || search.answer">
        <div v-if="search.status === 'searching'" class="search-status">Searching…</div>

        <div v-if="search.notices.length > 0" class="search-notices" aria-live="polite">
          <p v-for="notice in search.notices" :key="notice.code" class="search-notice">
            {{ notice.message }}
          </p>
        </div>

        <!-- Sources found (appear as retrieval completes, before synthesis) -->
        <div v-if="search.sources.length > 0 && search.status !== 'idle'" class="sources-section">
          <span class="sources-label"
            >Found {{ search.sources.length }} local source{{
              search.sources.length !== 1 ? 's' : ''
            }}
            · {{ retrievalLabel }}</span
          >
          <ul class="sources-list">
            <li v-for="(s, i) in search.sources" :key="i" class="source-item">
              <button type="button" class="source-btn" @click="openCitation(s.sourcePath)">
                <span class="source-index">[{{ s.index }}]</span>
                <span class="source-content">
                  <span class="source-path">{{ formatPath(s.sourcePath, s.headingPath) }}</span>
                  <span v-if="s.preview" class="source-preview">{{ s.preview }}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="renderedAnswer" class="search-answer" v-html="renderedAnswer" />

        <div v-if="search.status === 'error' && search.error" class="search-error">
          {{ search.error }}
        </div>

        <ol v-if="search.citations.length > 0" class="citation-list">
          <li v-for="c in search.citations" :key="c.index">
            <button class="citation-btn" @click="openCitation(c.sourcePath)">
              <span class="citation-index">[{{ c.index }}]</span>
              <span class="citation-path">{{ formatPath(c.sourcePath, c.headingPath) }}</span>
            </button>
          </li>
        </ol>
      </template>

      <!-- Local search history -->
      <div v-if="search.history.length > 0" class="history-section">
        <div class="history-header">
          <div class="history-label">Search history</div>
          <button class="history-clear" type="button" @click="search.clearHistory">Clear</button>
        </div>
        <div v-for="(entry, i) in search.history" :key="i" class="history-entry">
          <div class="history-query">{{ entry.query }}</div>
          <div class="history-answer">{{ entry.answer }}</div>
          <ol v-if="entry.citations.length > 0" class="citation-list citation-list--compact">
            <li v-for="c in entry.citations" :key="c.index">
              <button class="citation-btn" @click="openCitation(c.sourcePath)">
                <span class="citation-index">[{{ c.index }}]</span>
                <span class="citation-path">{{ formatPath(c.sourcePath, c.headingPath) }}</span>
              </button>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  overflow-y: auto;
}

.search-panel {
  width: min(700px, 92vw);
  background: var(--color-background-soft);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  margin-bottom: 2rem;
}

.search-input-row {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  background: var(--color-background-mute);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 1rem;
  padding: 0.55rem 0.75rem;
  outline: none;
  font-family: inherit;
}

.search-input:focus {
  border-color: rgba(255, 255, 255, 0.28);
}

.search-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.5rem 0.9rem;
}

.search-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.search-btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.14);
}

.search-controls {
  align-items: center;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
}

.segmented-control {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  display: inline-flex;
  overflow: hidden;
}

.segmented-control button {
  background: transparent;
  border: none;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--ev-c-text-3);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  min-width: 4.6rem;
  padding: 0.38rem 0.55rem;
}

.segmented-control button:last-child {
  border-right: none;
}

.segmented-control button.active {
  background: rgba(255, 255, 255, 0.11);
  color: var(--color-text);
}

.answer-toggle {
  align-items: center;
  color: var(--ev-c-text-2);
  display: inline-flex;
  gap: 0.4rem;
  font-size: 0.78rem;
  white-space: nowrap;
}

.answer-toggle input {
  height: 0.9rem;
  width: 0.9rem;
}

.cloud-warning {
  background: rgba(255, 184, 77, 0.1);
  border: 1px solid rgba(255, 184, 77, 0.24);
  border-radius: 6px;
  color: #ffd9a3;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.75rem;
}

.cloud-warning p {
  font-size: 0.84rem;
  line-height: 1.5;
  margin: 0;
}

.cloud-warning-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.cloud-warning button {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  color: var(--color-text);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  padding: 0.35rem 0.7rem;
}

.cloud-warning .primary-action {
  background: #2d6cdf;
  border-color: #2d6cdf;
}

.search-status {
  color: var(--ev-c-text-2);
  font-size: 0.875rem;
}

.search-notices {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.search-notice {
  background: rgba(255, 184, 77, 0.08);
  border: 1px solid rgba(255, 184, 77, 0.18);
  border-radius: 6px;
  color: #ffd9a3;
  font-size: 0.82rem;
  line-height: 1.45;
  margin: 0;
  padding: 0.5rem 0.65rem;
}

.sources-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
}

.sources-label {
  color: var(--ev-c-text-3);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: block;
  margin-bottom: 0.35rem;
}

.sources-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.source-item {
  margin: 0;
}

.source-btn {
  align-items: flex-start;
  background: transparent;
  border: none;
  color: var(--ev-c-text-2);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 0.78rem;
  gap: 0.45rem;
  padding: 0.25rem 0.3rem;
  text-align: left;
  width: 100%;
}

.source-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
}

.source-index {
  color: var(--ev-c-text-3);
  flex-shrink: 0;
}

.source-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.source-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-preview {
  color: var(--ev-c-text-3);
  display: -webkit-box;
  line-height: 1.35;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.search-answer {
  color: var(--color-text);
  font-size: 0.9rem;
  line-height: 1.65;
  max-height: 50vh;
  overflow-y: auto;
}

.search-answer :deep(p) {
  margin: 0.4rem 0;
}
.search-answer :deep(ul),
.search-answer :deep(ol) {
  padding-left: 1.25rem;
  margin: 0.4rem 0;
}
.search-answer :deep(li) {
  margin: 0.2rem 0;
}
.search-answer :deep(strong) {
  color: var(--ev-c-text-1);
  font-weight: 600;
}
.search-answer :deep(code) {
  font-size: 0.85em;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  padding: 0.1em 0.3em;
}

.search-error {
  color: #f87171;
  font-size: 0.875rem;
}

.citation-list {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  list-style: none;
}

.citation-list--compact {
  border-top: none;
  padding-top: 0.25rem;
  margin-top: 0.25rem;
}

.citation-btn {
  background: none;
  border: none;
  color: var(--ev-c-text-2);
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-family: inherit;
  padding: 0.2rem 0.3rem;
  border-radius: 4px;
  text-align: left;
  width: 100%;
}

.citation-btn:hover {
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.05);
}

.citation-index {
  color: var(--ev-c-text-3);
  flex-shrink: 0;
}

.citation-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-section {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.history-label {
  color: var(--ev-c-text-3);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.history-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.history-clear {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: var(--ev-c-text-3);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

.history-clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text);
}

.history-entry {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.history-query {
  color: var(--ev-c-text-2);
  font-size: 0.825rem;
  font-weight: 500;
}

.history-answer {
  color: var(--ev-c-text-3);
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 8rem;
  overflow-y: auto;
}

@media (max-width: 560px) {
  .search-controls {
    align-items: flex-start;
    flex-direction: column;
  }

  .segmented-control {
    width: 100%;
  }

  .segmented-control button {
    flex: 1;
    min-width: 0;
  }
}
</style>
