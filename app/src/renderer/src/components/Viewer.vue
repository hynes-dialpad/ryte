<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { render } from '../markdown/renderer'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'
import { WORKSPACE_TABPANEL_ID, getWorkspaceTabDomId } from './workspace-tab-keyboard'

const viewer = useViewerStore()
const workspace = useWorkspaceStore()
const renderedHtml = ref<string>('')
const renderError = ref<string | null>(null)
const renderCache = new Map<string, string>()
const proseEl = ref<HTMLElement | null>(null)
const sourceEl = ref<HTMLElement | null>(null)

const filenameDisplay = computed(() => {
  return viewer.sourcePath ?? ''
})
const activeTabPanelLabelledBy = computed(() =>
  workspace.activeTabId ? getWorkspaceTabDomId(workspace.activeTabId) : undefined
)

async function updateRender(text: string): Promise<void> {
  if (renderCache.has(text)) {
    renderedHtml.value = renderCache.get(text)!
    return
  }
  const html = await render(text)
  renderCache.set(text, html)
  // Bound cache to avoid unbounded growth on many file edits in one session.
  if (renderCache.size > 50) {
    const firstKey = renderCache.keys().next().value
    if (firstKey) renderCache.delete(firstKey)
  }
  // Only commit the result if the content hasn't changed in the meantime
  // (user may have switched files while we were rendering).
  if (text === viewer.content) {
    renderedHtml.value = html
  }
}

watch(
  () => viewer.content,
  (next) => {
    renderError.value = null
    if (!next) {
      renderedHtml.value = ''
      return
    }
    updateRender(next).catch((err) => {
      renderError.value = err instanceof Error ? err.message : String(err)
      renderedHtml.value = ''
    })
  },
  { immediate: true }
)

async function togglePreservingScroll(): Promise<void> {
  // Capture scroll percentage of the current view before the DOM swap.
  const fromEl = viewer.sourceMode ? sourceEl.value : proseEl.value
  const scrollPct = fromEl && fromEl.scrollHeight > 0 ? fromEl.scrollTop / fromEl.scrollHeight : 0

  await viewer.toggleSourceMode()

  // Wait for Vue to swap the element, then restore position.
  await nextTick()
  const toEl = viewer.sourceMode ? sourceEl.value : proseEl.value
  if (toEl && toEl.scrollHeight > 0) {
    toEl.scrollTop = scrollPct * toEl.scrollHeight
  }
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === 'e') {
    event.preventDefault()
    void togglePreservingScroll()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section
    :id="WORKSPACE_TABPANEL_ID"
    class="viewer"
    :role="activeTabPanelLabelledBy ? 'tabpanel' : undefined"
    :aria-labelledby="activeTabPanelLabelledBy"
    :aria-label="activeTabPanelLabelledBy ? undefined : 'Markdown viewer'"
  >
    <header v-if="viewer.sourcePath" class="viewer-toolbar">
      <span class="filename" :title="viewer.sourcePath">{{ filenameDisplay }}</span>
      <button type="button" class="toggle" @click="togglePreservingScroll()">
        {{ viewer.sourceMode ? 'Rendered' : 'Source' }}
        <span class="shortcut">⌘E</span>
      </button>
    </header>

    <div v-if="viewer.error" class="error">
      <p>
        Could not open <code>{{ filenameDisplay }}</code>
      </p>
      <p class="error-detail">{{ viewer.error }}</p>
    </div>
    <div v-else-if="renderError" class="error">
      <p>Render failed</p>
      <p class="error-detail">{{ renderError }}</p>
    </div>
    <p v-else-if="!viewer.sourcePath" class="empty">Select a file to view</p>
    <p v-else-if="viewer.loading" class="empty">Loading…</p>
    <pre
      v-else-if="viewer.sourceMode"
      ref="sourceEl"
      class="source ryte-scrollbar ryte-scrollbar--y"
    ><code>{{ viewer.content }}</code></pre>
    <!-- eslint-disable vue/no-v-html -- markdown-it has html:false; shiki output is generator-produced -->
    <article
      v-else
      ref="proseEl"
      class="prose ryte-scrollbar ryte-scrollbar--y"
      v-html="renderedHtml"
    ></article>
    <!-- eslint-enable vue/no-v-html -->
  </section>
</template>

<style scoped>
.viewer {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.viewer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.filename {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.toggle {
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: white;
}

.shortcut {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
}

.empty,
.error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  padding: 2rem;
  text-align: center;
}

.error code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(255, 200, 200, 0.85);
}

.error-detail {
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-top: 0.5rem;
  color: rgba(255, 150, 150, 0.6);
  max-width: 50ch;
}

.source {
  flex: 1;
  margin: 0;
  padding: 1.5rem 2rem;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.85);
  white-space: pre-wrap;
  word-wrap: break-word;
  background: transparent;
}

.prose {
  flex: 1;
  overflow: auto;
  padding: 2rem 2.5rem 4rem;
  max-width: 100%;
  color: rgba(255, 255, 255, 0.88);
  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  font-size: 0.9375rem;
  line-height: 1.65;
}

.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3),
.prose :deep(h4) {
  color: white;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin-top: 1.75em;
  margin-bottom: 0.5em;
}

.prose :deep(h1) {
  font-size: 1.75rem;
  margin-top: 0;
}

.prose :deep(h2) {
  font-size: 1.35rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 0.25em;
}

.prose :deep(h3) {
  font-size: 1.125rem;
}

.prose :deep(p),
.prose :deep(ul),
.prose :deep(ol),
.prose :deep(blockquote) {
  margin: 0.85em 0;
}

.prose :deep(ul) {
  padding-left: 1.5em;
  list-style-type: disc;
}

.prose :deep(ol) {
  padding-left: 1.5em;
  list-style-type: decimal;
}

.prose :deep(ul ul) {
  list-style-type: circle;
}

.prose :deep(li) {
  margin: 0.25em 0;
}

.prose :deep(a) {
  color: rgba(120, 200, 255, 0.95);
  text-decoration: none;
  border-bottom: 1px solid rgba(120, 200, 255, 0.3);
}

.prose :deep(a:hover) {
  border-bottom-color: rgba(120, 200, 255, 0.7);
}

.prose :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875em;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  color: rgba(255, 220, 180, 0.9);
}

.prose :deep(pre) {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 6px;
  padding: 1rem 1.2rem;
  overflow: auto;
  font-size: 0.8125rem;
  line-height: 1.55;
  margin: 1.25em 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.prose :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

.prose :deep(blockquote) {
  border-left: 3px solid rgba(120, 200, 255, 0.4);
  padding-left: 1em;
  color: rgba(255, 255, 255, 0.65);
  font-style: italic;
}

.prose :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1.25em 0;
  font-size: 0.875em;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  overflow: hidden;
}

.prose :deep(th),
.prose :deep(td) {
  text-align: left;
  padding: 0.5em 0.85em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.prose :deep(th):last-child,
.prose :deep(td):last-child {
  border-right: none;
}

.prose :deep(th) {
  font-weight: 600;
  color: white;
  background: rgba(255, 255, 255, 0.06);
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
}

.prose :deep(tr:last-child td) {
  border-bottom: none;
}

.prose :deep(tr:hover td) {
  background: rgba(255, 255, 255, 0.03);
}

.prose :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 2em 0;
}

.prose :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
</style>
