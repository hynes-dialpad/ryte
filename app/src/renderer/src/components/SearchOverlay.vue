<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { render } from '../markdown/renderer'
import { useSearchStore } from '../stores/search'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'
import { buildSearchResults, documentTitle } from './search-result-model'
import { createAnswerRenderScheduler } from './search-answer-render-scheduler'
import type {
  SearchCitation,
  SearchQueryOptions,
  SearchRetrievalMode
} from '../../../preload/index'

const emit = defineEmits<{ close: []; openSettings: [] }>()

const PROVIDER_SETUP_NOTICE_STORAGE_KEY = 'ryte.search.provider-setup-notice-dismissed.v1'

const search = useSearchStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const inputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const localQuery = ref('')
const renderedAnswer = ref('')
const pendingCloudQuery = ref('')
const showCloudWarning = ref(false)
const retrievalMode = ref<SearchRetrievalMode>('auto')
const retainedPanelHeight = ref(0)
const providerSetupNoticeDismissed = ref(loadProviderSetupNoticeDismissal())
const answerRenderScheduler = createAnswerRenderScheduler(
  () => search.answer,
  async (markdown) => {
    const html = markdown ? await renderAnswer(markdown, search.citations) : ''
    if (markdown === search.answer) renderedAnswer.value = html
  }
)

const searchResults = computed(() => buildSearchResults(search.sources, search.citations))
const showSearchResults = computed(
  () => searchResults.value.length > 0 && (search.status === 'done' || search.status === 'error')
)
const showHistory = computed(
  () => localQuery.value.trim().length === 0 && search.status === 'idle' && !search.answer
)
const hasConfiguredAnswerProvider = computed(() => {
  if (!settings.state) return false
  return settings.state.answerProvider === 'anthropic'
    ? settings.state.hasAnthropicKey
    : settings.state.hasOpenAIKey
})
const showProviderSetupNotice = computed(
  () =>
    settings.state?.cloudAnswersEnabled === true &&
    !hasConfiguredAnswerProvider.value &&
    !providerSetupNoticeDismissed.value
)
const visibleNotices = computed(() =>
  search.notices.filter((notice) => notice.code !== 'provider-key-missing')
)

watch(
  [() => search.answer, () => search.citations],
  ([markdown]) => {
    if (!markdown) renderedAnswer.value = ''
    answerRenderScheduler.schedule()
  },
  { deep: true }
)

watch(
  () => search.status,
  (status) => {
    if (status === 'done' || status === 'error') void answerRenderScheduler.flush()
  }
)

onBeforeUnmount(() => {
  answerRenderScheduler.dispose()
})

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
  if (settings.state?.cloudAnswersEnabled && !hasCurrentCloudAcknowledgement()) {
    pendingCloudQuery.value = q
    showCloudWarning.value = true
    return
  }
  await runSearch(q)
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
  await runSearch(q)
}

async function searchLocallyOnly(): Promise<void> {
  const q = pendingCloudQuery.value
  if (!q) return
  showCloudWarning.value = false
  pendingCloudQuery.value = ''
  await runSearch(q, 'local-only')
}

function loadProviderSetupNoticeDismissal(): boolean {
  try {
    return window.localStorage.getItem(PROVIDER_SETUP_NOTICE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function dismissProviderSetupNotice(): void {
  providerSetupNoticeDismissed.value = true
  try {
    window.localStorage.setItem(PROVIDER_SETUP_NOTICE_STORAGE_KEY, 'true')
  } catch {
    // The notice remains dismissed for this session if local storage is unavailable.
  }
}

function openProviderSettings(): void {
  emit('openSettings')
}

async function relaunchHistory(query: string): Promise<void> {
  localQuery.value = query
  await submit()
}

function openCitation(sourcePath: string): void {
  void workspace.openOrFocusFile({ sourcePath })
  void closeOverlay()
}

function openAnswerCitation(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const citationIndex = Number(
    target.closest<HTMLElement>('[data-citation-index]')?.dataset.citationIndex
  )
  const citation = search.citations.find((item) => item.index === citationIndex)
  if (citation) openCitation(citation.sourcePath)
}

function preservePanelHeight(): void {
  const height = panelRef.value?.getBoundingClientRect().height
  if (height) retainedPanelHeight.value = Math.ceil(height)
}

async function runSearch(
  query: string,
  answerMode?: SearchQueryOptions['answerMode']
): Promise<void> {
  preservePanelHeight()
  await search.runQuery(query, searchOptions(answerMode))
}

function searchOptions(answerMode?: SearchQueryOptions['answerMode']): SearchQueryOptions {
  return answerMode
    ? { retrievalMode: retrievalMode.value, answerMode }
    : { retrievalMode: retrievalMode.value }
}

function hasCurrentCloudAcknowledgement(): boolean {
  const s = settings.state
  return (
    !!s?.cloudAnswersAcknowledgement &&
    s.cloudAnswersAcknowledgement.provider === s.answerProvider &&
    s.cloudAnswersAcknowledgement.model === s.answerModel
  )
}

async function renderAnswer(markdown: string, citations: SearchCitation[]): Promise<string> {
  const html = await render(markdown)
  if (citations.length === 0) return html

  const citationsByIndex = new Map(citations.map((citation) => [citation.index, citation]))
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node = walker.nextNode()

  while (node) {
    const textNode = node as Text
    if (!textNode.parentElement?.closest('a, button, code, pre')) textNodes.push(textNode)
    node = walker.nextNode()
  }

  for (const textNode of textNodes) {
    const fragments = document.createDocumentFragment()
    const segments = textNode.textContent?.split(/(\[\d+\])/g) ?? []
    let hasCitation = false

    for (const segment of segments) {
      const match = /^\[(\d+)\]$/.exec(segment)
      const index = match ? Number(match[1]) : Number.NaN
      if (!match || !citationsByIndex.has(index)) {
        fragments.append(segment)
        continue
      }

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'answer-citation'
      button.dataset.citationIndex = String(index)
      button.setAttribute('aria-label', `Open cited source ${index}`)
      button.textContent = segment
      fragments.append(button)
      hasCitation = true
    }

    if (hasCitation) textNode.replaceWith(fragments)
  }

  return template.innerHTML
}

async function closeOverlay(): Promise<void> {
  if (search.status === 'searching' || search.status === 'streaming') {
    await search.cancel()
  }
  emit('close')
}
</script>

<template>
  <div
    class="search-backdrop ryte-scrollbar ryte-scrollbar--y"
    @click.self="closeOverlay"
    @keydown="onKeydown"
  >
    <div
      ref="panelRef"
      class="search-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Search notes"
      :style="
        search.status === 'searching' || search.status === 'streaming'
          ? { minHeight: `${retainedPanelHeight}px` }
          : undefined
      "
    >
      <header class="search-header">
        <div class="search-input-row">
          <div class="search-input-shell">
            <input
              ref="inputRef"
              v-model="localQuery"
              class="search-input"
              type="text"
              placeholder="Ask anything about your notes…"
              @keydown.enter="submit"
              @keydown.esc="closeOverlay"
            />
            <select
              v-model="retrievalMode"
              class="search-mode"
              aria-label="Search mode"
              title="Best match uses semantic retrieval when available and falls back to keyword search."
            >
              <option value="auto">Best match</option>
              <option value="keyword">Keywords only</option>
            </select>
          </div>
          <button
            class="search-btn"
            aria-label="Run search"
            :disabled="
              !localQuery.trim() || search.status === 'searching' || search.status === 'streaming'
            "
            @click="submit"
          >
            {{ search.status === 'searching' || search.status === 'streaming' ? '…' : '↵' }}
          </button>
        </div>

        <div v-if="showCloudWarning" class="cloud-warning" role="alertdialog" aria-live="assertive">
          <p>
            This is the first time Ryte will send note content outside your Mac. Ryte will send this
            query and selected matching excerpts to your configured model provider. Local keyword
            search remains available without sending data.
          </p>
          <div class="cloud-warning-actions">
            <button type="button" @click="searchLocallyOnly">Search locally</button>
            <button type="button" class="primary-action" @click="continueWithCloud">
              Continue
            </button>
          </div>
        </div>
      </header>

      <main class="search-content ryte-scrollbar ryte-scrollbar--y" aria-label="Search content">
        <!-- Current result -->
        <template v-if="search.status !== 'idle' || search.answer">
          <div v-if="search.status === 'searching'" class="search-status">Searching…</div>

          <div v-if="visibleNotices.length > 0" class="search-notices" aria-live="polite">
            <p v-for="notice in visibleNotices" :key="notice.code" class="search-notice">
              {{ notice.message }}
            </p>
          </div>

          <aside v-if="showProviderSetupNotice" class="provider-setup-notice" aria-live="polite">
            <span
              >No API key is set for
              {{ settings.state?.answerProvider === 'anthropic' ? 'Anthropic' : 'OpenAI' }}.</span
            >
            <button type="button" @click="openProviderSettings">Set up AI</button>
            <button
              type="button"
              class="provider-setup-dismiss"
              @click="dismissProviderSetupNotice"
            >
              Dismiss
            </button>
          </aside>

          <Transition name="answer-reveal">
            <!-- eslint-disable vue/no-v-html -->
            <div
              v-if="renderedAnswer"
              class="search-answer"
              @click="openAnswerCitation"
              v-html="renderedAnswer"
            />
            <!-- eslint-enable vue/no-v-html -->
          </Transition>

          <div v-if="search.status === 'error' && search.error" class="search-error">
            {{ search.error }}
          </div>

          <section
            v-if="search.citations.length > 0"
            class="citation-section"
            aria-label="Cited sources"
          >
            <div class="section-heading">Cited sources</div>
            <ul class="citation-list">
              <li v-for="c in search.citations" :key="c.index">
                <button class="citation-btn" type="button" @click="openCitation(c.sourcePath)">
                  <span class="citation-index">[{{ c.index }}]</span>
                  <span class="citation-content">
                    <span class="citation-title">{{ documentTitle(c.sourcePath) }}</span>
                    <span class="citation-path">{{ c.sourcePath }}</span>
                    <span v-if="c.headingPath.length" class="citation-heading">
                      {{ c.headingPath.join(' › ') }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </section>

          <section v-if="showSearchResults" class="results-section" aria-label="Search results">
            <div class="section-heading">
              Search results
              <span>
                · {{ searchResults.length }} document{{ searchResults.length === 1 ? '' : 's' }}
              </span>
            </div>
            <ul class="results-list">
              <li v-for="result in searchResults" :key="result.sourcePath">
                <button type="button" class="result-btn" @click="openCitation(result.sourcePath)">
                  <span class="result-title">{{ result.title }}</span>
                  <span class="result-path">{{ result.sourcePath }}</span>
                  <span v-if="result.headingPath.length" class="result-heading">
                    {{ result.headingPath.join(' › ') }}
                  </span>
                  <span class="result-preview">{{ result.preview }}</span>
                  <span v-if="result.matchCount > 0" class="result-matches">
                    {{ result.matchCount }} match{{ result.matchCount === 1 ? '' : 'es' }}
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </template>

        <!-- Local search history -->
        <div v-if="showHistory && search.history.length > 0" class="history-section">
          <div class="history-header">
            <div class="history-label">Search history</div>
            <button class="history-clear" type="button" @click="search.clearHistory">Clear</button>
          </div>
          <ul class="history-list">
            <li v-for="(entry, i) in search.history" :key="i">
              <button type="button" class="history-entry" @click="relaunchHistory(entry.query)">
                {{ entry.query }}
              </button>
            </li>
          </ul>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.6);
}

.search-panel {
  width: min(760px, 92vw);
  min-height: min(34rem, calc(100vh - 2rem));
  max-height: calc(100vh - 2rem);
  margin: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

.search-header {
  flex: 0 0 auto;
  padding: 1.25rem 1.25rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.search-content {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0.9rem 1.25rem 1.25rem;
}

.search-input-row,
.search-input-shell {
  display: flex;
  min-width: 0;
}

.search-input-row {
  gap: 0.5rem;
}

.search-input-shell {
  flex: 1;
  align-items: center;
  background: var(--color-background-mute);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 7px;
}

.search-input-shell:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(45, 108, 223, 0.2);
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 0.7rem 0.85rem;
  color: var(--color-text);
  background: transparent;
  border: 0;
  outline: none;
  font-family: inherit;
  font-size: 1rem;
}

.search-mode {
  min-height: 2rem;
  margin-right: 0.4rem;
  padding: 0 1.6rem 0 0.55rem;
  color: var(--ev-c-text-2);
  background: rgba(255, 255, 255, 0.06);
  border: 0;
  border-radius: 4px;
  font: inherit;
  font-size: 0.78rem;
}

.search-mode:focus-visible,
.search-btn:focus-visible,
.history-entry:focus-visible,
.result-btn:focus-visible,
.citation-btn:focus-visible,
.cloud-warning button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.search-btn {
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: 0.45rem 0.85rem;
  color: var(--color-primary-text);
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: 7px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 650;
}

.search-btn:disabled {
  color: var(--ev-c-text-3);
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  cursor: default;
}

.search-btn:not(:disabled):hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.cloud-warning,
.search-notice {
  color: #ffd9a3;
  background: rgba(255, 184, 77, 0.1);
  border: 1px solid rgba(255, 184, 77, 0.24);
  border-radius: 6px;
}

.cloud-warning {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.75rem;
}

.cloud-warning p,
.search-notice {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.5;
}

.cloud-warning-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.cloud-warning button {
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
}

.cloud-warning .primary-action {
  color: var(--color-primary-text);
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.provider-setup-notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.6rem;
  padding: 0.55rem 0.65rem;
  color: var(--ev-c-text-2);
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
  font-size: 0.8rem;
}

.provider-setup-notice button {
  padding: 0.2rem 0;
  color: #b8d2ff;
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.provider-setup-notice button:hover {
  color: #ffffff;
  text-decoration: underline;
}

.provider-setup-notice .provider-setup-dismiss {
  margin-left: auto;
  color: var(--ev-c-text-3);
  font-weight: 400;
}

.provider-setup-notice button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
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
  padding: 0.5rem 0.65rem;
}

.search-answer {
  color: var(--color-text);
  font-size: 0.94rem;
  line-height: 1.7;
}

.answer-reveal-enter-active {
  transition:
    opacity 180ms ease-out,
    transform 180ms ease-out;
}

.answer-reveal-enter-from {
  opacity: 0;
  transform: translateY(0.35rem);
}

@media (prefers-reduced-motion: reduce) {
  .answer-reveal-enter-active {
    transition: none;
  }
}

.search-answer :deep(p) {
  margin: 0.45rem 0;
}

.search-answer :deep(h2),
.search-answer :deep(h3) {
  margin: 1.1rem 0 0.4rem;
  color: var(--ev-c-text-1);
  font-size: 0.95rem;
  font-weight: 650;
  line-height: 1.35;
}

.search-answer :deep(ul) {
  margin: 0.45rem 0;
  padding-left: 1.25rem;
  list-style: disc;
}

.search-answer :deep(ol) {
  margin: 0.45rem 0;
  padding-left: 1.25rem;
}

.search-answer :deep(li) {
  margin: 0.25rem 0;
}

.search-answer :deep(strong) {
  color: var(--ev-c-text-1);
  font-weight: 650;
}

.search-answer :deep(code) {
  padding: 0.1em 0.3em;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  font-size: 0.85em;
}

.search-answer :deep(.answer-citation) {
  margin: 0 0.08rem;
  padding: 0.04rem 0.28rem;
  color: #b8d2ff;
  background: rgba(45, 108, 223, 0.16);
  border: 0;
  border-radius: 3px;
  cursor: pointer;
  font: inherit;
  line-height: inherit;
}

.search-answer :deep(.answer-citation:hover) {
  color: #ffffff;
  background: var(--color-primary);
}

.search-error {
  color: #ff9494;
  font-size: 0.875rem;
}

.citation-section,
.results-section {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
  padding-top: 0.8rem;
}

.history-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-heading,
.history-label {
  color: var(--ev-c-text-2);
  font-size: 0.78rem;
  font-weight: 600;
}

.section-heading span {
  color: var(--ev-c-text-3);
  font-weight: 400;
}

.citation-list,
.results-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin: 0 -0.35rem;
  padding: 0;
}

.citation-btn,
.result-btn,
.history-entry {
  width: 100%;
  color: var(--ev-c-text-2);
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.citation-btn,
.result-btn {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.55rem;
  padding: 0.42rem 0.35rem;
}

.citation-btn:hover,
.result-btn:hover,
.history-entry:hover {
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.05);
}

.citation-index {
  grid-row: span 3;
  color: var(--ev-c-text-3);
  font-size: 0.78rem;
}

.citation-content {
  display: grid;
  gap: 0.06rem;
  min-width: 0;
}

.citation-title,
.result-title {
  color: var(--ev-c-text-1);
  font-size: 0.86rem;
  font-weight: 600;
}

.citation-path,
.result-path,
.citation-heading,
.result-heading,
.result-preview,
.result-matches {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.citation-path,
.result-path {
  color: var(--ev-c-text-3);
  font-size: 0.76rem;
}

.citation-heading,
.result-heading {
  color: var(--ev-c-text-3);
  font-size: 0.72rem;
}

.result-btn {
  grid-template-columns: minmax(0, 1fr) auto;
  row-gap: 0.08rem;
}

.result-title,
.result-path,
.result-heading,
.result-preview {
  grid-column: 1;
}

.result-preview {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ev-c-text-2);
  font-size: 0.79rem;
  line-height: 1.4;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.result-matches {
  grid-column: 2;
  grid-row: 1;
  align-self: start;
  color: var(--ev-c-text-3);
  font-size: 0.72rem;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.history-clear {
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  color: var(--ev-c-text-2);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
}

.history-clear:hover {
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.08);
}

.history-entry {
  min-height: 2rem;
  padding: 0.35rem;
  overflow: hidden;
  font-size: 0.88rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .search-backdrop {
    padding: 0.5rem;
  }

  .search-panel {
    width: 100%;
    max-height: calc(100vh - 1rem);
  }

  .search-header {
    padding: 1rem 1rem 0.7rem;
  }

  .search-content {
    padding: 0.75rem 1rem 1rem;
  }

  .search-input-row {
    align-items: stretch;
  }

  .search-mode {
    max-width: 5.4rem;
  }
}
</style>
