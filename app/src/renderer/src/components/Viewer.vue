<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { renderMermaidDiagrams } from '../markdown/mermaid'
import {
  renderDocument,
  type MarkdownOutlineItem,
  type RenderedMarkdownDocument
} from '../markdown/renderer'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'
import {
  DOCUMENT_OUTLINE_COLLAPSED_WIDTH,
  clampDocumentOutlineWidth
} from '../../../shared/workspace'
import IconSidebar from './icons/IconSidebar.vue'
import { WORKSPACE_TABPANEL_ID, getWorkspaceTabDomId } from './workspace-tab-keyboard'

const viewer = useViewerStore()
const workspace = useWorkspaceStore()
const renderedHtml = ref<string>('')
const documentOutline = ref<MarkdownOutlineItem[]>([])
const renderError = ref<string | null>(null)
const renderCache = new Map<string, RenderedMarkdownDocument>()
const proseEl = ref<HTMLElement | null>(null)
const sourceEl = ref<HTMLElement | null>(null)
const fallbackOutlineCollapsed = ref(false)
const dragOutlineWidth = ref<number | null>(null)
const activeOutlineId = ref('overview')

let _stopOutlineResize: (() => void) | undefined

const filenameDisplay = computed(() => {
  return viewer.displayPath ?? ''
})
const activeTabPanelLabelledBy = computed(() =>
  workspace.activeTabId ? getWorkspaceTabDomId(workspace.activeTabId) : undefined
)
const sectionOutline = computed(() =>
  documentOutline.value.filter((item) => item.level >= 2 && item.level <= 4)
)
const outlineParentById = computed(() => {
  const parents = new Map<string, string>()
  let currentSectionId: string | null = null

  for (const item of sectionOutline.value) {
    if (item.level === 2) {
      currentSectionId = item.id
      parents.set(item.id, item.id)
    } else if (currentSectionId) {
      parents.set(item.id, currentSectionId)
    }
  }

  return parents
})
const activeSectionId = computed(() =>
  activeOutlineId.value === 'overview'
    ? null
    : (outlineParentById.value.get(activeOutlineId.value) ?? null)
)
const visibleSectionOutline = computed(() =>
  sectionOutline.value.filter((item) => {
    if (item.level === 2) return true
    return outlineParentById.value.get(item.id) === activeSectionId.value
  })
)
const hasDocumentOutline = computed(
  () => !viewer.sourceMode && !viewer.loading && !viewer.error && sectionOutline.value.length > 0
)
const outlineSourcePath = computed(() => viewer.sourcePath)
const isOutlineCollapsed = computed(() => {
  const sourcePath = outlineSourcePath.value
  if (!sourcePath) return fallbackOutlineCollapsed.value
  return workspace.outlineCollapsedByPath[sourcePath] === true
})
const documentOutlineWidth = computed(
  () => dragOutlineWidth.value ?? clampDocumentOutlineWidth(workspace.outlineWidth)
)
const documentOutlineStyle = computed(() => {
  const width = isOutlineCollapsed.value
    ? DOCUMENT_OUTLINE_COLLAPSED_WIDTH
    : documentOutlineWidth.value
  return {
    width: `${width}px`,
    flexBasis: `${width}px`
  }
})

async function updateRender(text: string): Promise<void> {
  if (renderCache.has(text)) {
    const cached = renderCache.get(text)!
    renderedHtml.value = cached.html
    documentOutline.value = cached.outline
    return
  }
  const document = await renderDocument(text, { interactiveTasks: true })
  renderCache.set(text, document)
  // Bound cache to avoid unbounded growth on many file edits in one session.
  if (renderCache.size > 50) {
    const firstKey = renderCache.keys().next().value
    if (firstKey) renderCache.delete(firstKey)
  }
  // Only commit the result if the content hasn't changed in the meantime
  // (user may have switched files while we were rendering).
  if (text === viewer.content) {
    renderedHtml.value = document.html
    documentOutline.value = document.outline
  }
}

async function hydrateRenderedContent(): Promise<void> {
  await nextTick()
  if (viewer.sourceMode || !proseEl.value) return
  await renderMermaidDiagrams(proseEl.value)
  updateActiveOutline()
}

watch(
  () => viewer.content,
  (next) => {
    renderError.value = null
    if (!next) {
      renderedHtml.value = ''
      documentOutline.value = []
      return
    }
    updateRender(next).catch((err) => {
      renderError.value = err instanceof Error ? err.message : String(err)
      renderedHtml.value = ''
      documentOutline.value = []
    })
  },
  { immediate: true }
)

watch(
  [renderedHtml, () => viewer.sourceMode],
  () => {
    hydrateRenderedContent().catch((err) => {
      renderError.value = err instanceof Error ? err.message : String(err)
    })
  },
  { flush: 'post' }
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

function onToggleSourceMode(): void {
  void togglePreservingScroll()
}

function onRenderedClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('a')) return

  const taskLine = target?.closest<HTMLElement>('.markdown-task-line')
  const button =
    target?.closest<HTMLButtonElement>('.markdown-task-toggle') ??
    taskLine?.querySelector<HTMLButtonElement>('.markdown-task-toggle')
  if (!button || !proseEl.value?.contains(button)) return

  const line = Number(button.dataset.taskLine)
  const checkboxColumn = Number(button.dataset.taskCheckboxColumn)
  const isChecked = button.dataset.taskChecked === 'true'
  if (!Number.isInteger(line) || !Number.isInteger(checkboxColumn)) return

  event.preventDefault()
  button.disabled = true
  void viewer.toggleRenderedTask({ line, checkboxColumn, checked: !isChecked }).finally(() => {
    button.disabled = false
  })
}

function updateActiveOutline(): void {
  const scrollEl = proseEl.value
  if (!scrollEl) return

  const scrollTop = scrollEl.scrollTop
  let activeId = 'overview'

  for (const item of sectionOutline.value) {
    const heading = scrollEl.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`)
    if (!heading) continue
    if (heading.offsetTop <= scrollTop + 32) {
      activeId = item.id
    }
  }

  activeOutlineId.value = activeId
}

function onRenderedScroll(): void {
  updateActiveOutline()
}

function scrollToOverview(): void {
  proseEl.value?.scrollTo({ top: 0, behavior: 'auto' })
  activeOutlineId.value = 'overview'
}

function scrollToHeading(id: string): void {
  const scrollEl = proseEl.value
  const heading = scrollEl?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!scrollEl || !heading) return

  scrollEl.scrollTo({ top: Math.max(heading.offsetTop - 8, 0), behavior: 'auto' })
  activeOutlineId.value = id
}

function setOutlineCollapsed(collapsed: boolean): void {
  const sourcePath = outlineSourcePath.value
  if (!sourcePath) {
    fallbackOutlineCollapsed.value = collapsed
    return
  }

  void workspace.setOutlineCollapsed({ sourcePath, collapsed })
}

function toggleDocumentOutline(): void {
  setOutlineCollapsed(!isOutlineCollapsed.value)
}

function startOutlineResize(event: PointerEvent): void {
  if (isOutlineCollapsed.value) return

  event.preventDefault()
  const startX = event.clientX
  const startWidth = documentOutlineWidth.value
  let latestClientX = startX
  let resizeFrame: number | null = null
  dragOutlineWidth.value = startWidth

  const applyMove = (): void => {
    resizeFrame = null
    dragOutlineWidth.value = clampDocumentOutlineWidth(startWidth + latestClientX - startX)
  }

  const onMove = (moveEvent: PointerEvent): void => {
    latestClientX = moveEvent.clientX
    if (resizeFrame === null) {
      resizeFrame = window.requestAnimationFrame(applyMove)
    }
  }

  const onUp = (upEvent: PointerEvent): void => {
    const width = clampDocumentOutlineWidth(startWidth + upEvent.clientX - startX)
    _stopOutlineResize?.()
    dragOutlineWidth.value = null
    void workspace.setOutlineWidth({ width })
  }

  _stopOutlineResize = () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = null
    }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    _stopOutlineResize = undefined
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

onMounted(() => {
  window.addEventListener('ryte:toggle-source-mode', onToggleSourceMode)
})

onUnmounted(() => {
  _stopOutlineResize?.()
  window.removeEventListener('ryte:toggle-source-mode', onToggleSourceMode)
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
    <p v-else-if="!viewer.displayPath" class="empty">Select a file to view</p>
    <p v-else-if="viewer.loading" class="empty">Loading…</p>
    <pre
      v-else-if="viewer.sourceMode"
      ref="sourceEl"
      class="source ryte-scrollbar ryte-scrollbar--y"
    ><code>{{ viewer.content }}</code></pre>
    <div v-else class="document-view">
      <aside
        v-if="hasDocumentOutline"
        class="document-outline ryte-scrollbar ryte-scrollbar--y"
        :class="{ 'document-outline--collapsed': isOutlineCollapsed }"
        :style="documentOutlineStyle"
        aria-label="Document sections"
      >
        <div
          v-if="!isOutlineCollapsed"
          class="document-outline-overview-row"
          :class="{ 'document-outline-item--active': activeOutlineId === 'overview' }"
        >
          <button
            type="button"
            class="document-outline-item document-outline-item--overview"
            :aria-current="activeOutlineId === 'overview' ? 'location' : undefined"
            @click="scrollToOverview"
          >
            <span
              class="document-outline-marker"
              :class="{ 'document-outline-marker--active': activeOutlineId === 'overview' }"
              aria-hidden="true"
            ></span>
            <span class="document-outline-title">Overview</span>
          </button>
          <button
            type="button"
            class="document-outline-collapse-button"
            aria-label="Hide document sections"
            aria-controls="document-outline-list"
            :aria-expanded="true"
            @click="toggleDocumentOutline"
          >
            <IconSidebar />
          </button>
        </div>
        <button
          v-else
          type="button"
          class="document-outline-expand-button"
          aria-label="Show document sections"
          aria-controls="document-outline-list"
          :aria-expanded="false"
          @click="toggleDocumentOutline"
        >
          <IconSidebar />
        </button>
        <nav v-if="!isOutlineCollapsed" id="document-outline-list" class="document-outline-list">
          <button
            v-for="item in visibleSectionOutline"
            :key="item.id"
            type="button"
            class="document-outline-item"
            :class="[
              `document-outline-item--level-${item.level}`,
              { 'document-outline-item--active': activeOutlineId === item.id }
            ]"
            :aria-current="activeOutlineId === item.id ? 'location' : undefined"
            @click="scrollToHeading(item.id)"
          >
            <span
              class="document-outline-marker"
              :class="{ 'document-outline-marker--active': activeOutlineId === item.id }"
              aria-hidden="true"
            ></span>
            <span class="document-outline-title">{{ item.text }}</span>
          </button>
        </nav>
        <div
          v-if="!isOutlineCollapsed"
          class="document-outline-resize"
          role="separator"
          aria-label="Resize document sections"
          aria-orientation="vertical"
          @pointerdown="startOutlineResize"
        ></div>
      </aside>
      <!-- eslint-disable vue/no-v-html -- markdown-it has html:false; shiki output is generator-produced -->
      <article
        ref="proseEl"
        class="prose ryte-scrollbar ryte-scrollbar--y"
        @click="onRenderedClick"
        @scroll.passive="onRenderedScroll"
        v-html="renderedHtml"
      ></article>
      <!-- eslint-enable vue/no-v-html -->
    </div>
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

.document-view {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.document-outline {
  position: relative;
  flex: 0 0 auto;
  padding: 1.35rem 0.75rem 1.5rem;
  overflow: auto;
}

.document-outline--collapsed {
  padding-left: 0.45rem;
  padding-right: 0.45rem;
}

.document-outline-overview-row {
  width: 100%;
  min-height: 2rem;
  display: flex;
  align-items: center;
  border-radius: 0.35rem;
  background: transparent;
}

.document-outline-overview-row:hover,
.document-outline-overview-row:focus-within {
  background: rgba(255, 255, 255, 0.06);
}

.document-outline-overview-row.document-outline-item--active {
  background: rgba(255, 255, 255, 0.08);
}

.document-outline-item {
  width: 100%;
  min-height: 1.7rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0.55rem;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.58);
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
}

.document-outline-overview-row .document-outline-item {
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 0;
  background: transparent;
}

.document-outline-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

.document-outline-item:focus-visible,
.document-outline-item--active {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.document-outline-overview-row .document-outline-item:hover,
.document-outline-overview-row .document-outline-item:focus-visible,
.document-outline-overview-row .document-outline-item--active {
  background: transparent;
}

.document-outline-item:focus-visible,
.document-outline-collapse-button:focus-visible,
.document-outline-expand-button:focus-visible {
  outline: 2px solid rgba(80, 158, 255, 0.9);
  outline-offset: 2px;
}

.document-outline-list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: 0.55rem;
}

.document-outline-collapse-button,
.document-outline-expand-button {
  width: 1.85rem;
  height: 1.85rem;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
}

.document-outline-collapse-button:hover,
.document-outline-expand-button:hover {
  background: rgba(255, 255, 255, 0.06);
  color: white;
}

.document-outline-expand-button {
  margin: 0 auto;
}

.document-outline-item--level-3 {
  padding-left: 1.35rem;
  font-size: 0.775rem;
}

.document-outline-item--level-4 {
  padding-left: 2.15rem;
  font-size: 0.75rem;
}

.document-outline-marker {
  width: 0.35rem;
  height: 0.35rem;
  flex: 0 0 auto;
  border-radius: 999px;
  opacity: 0;
  background: currentColor;
}

.document-outline-marker--active {
  opacity: 1;
}

.document-outline-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-outline-resize {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  width: 20px;
  cursor: col-resize;
  touch-action: none;
}

.document-outline-resize::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2px;
  background: transparent;
}

.document-outline-resize:hover::after {
  background: oklch(66.267% 0.18645 249.972 / 80%);
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
  min-width: 0;
  overflow: auto;
  padding: 2rem 2.5rem 4rem;
  max-width: 100%;
  color: rgba(255, 255, 255, 0.88);
  font-family:
    'Geist',
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

.prose :deep(.markdown-task-list) {
  padding-left: 0.5em;
}

.prose :deep(li) {
  margin: 0.25em 0;
}

.prose :deep(.markdown-task-item) {
  list-style-type: none;
}

.prose :deep(.markdown-task-item::marker) {
  content: '';
}

.prose :deep(.markdown-task-line) {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55em;
  cursor: pointer;
}

.prose :deep(.markdown-task-content) {
  cursor: pointer;
}

.prose :deep(.markdown-task-toggle) {
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 0.25em;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  vertical-align: -0.12em;
  position: relative;
}

.prose :deep(.markdown-task-toggle:hover),
.prose :deep(.markdown-task-line:hover .markdown-task-toggle),
.prose :deep(.markdown-task-toggle:focus-visible) {
  border-color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.1);
}

.prose :deep(.markdown-task-toggle:focus-visible) {
  outline: 2px solid rgba(80, 158, 255, 0.9);
  outline-offset: 2px;
}

.prose :deep(.markdown-task-toggle[data-task-checked='true']) {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.42);
}

.prose :deep(.markdown-task-toggle[data-task-checked='true']::after) {
  content: '';
  position: absolute;
  left: 0.24em;
  top: 0.1em;
  width: 0.35em;
  height: 0.6em;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(42deg);
}

.prose :deep(.markdown-task-toggle:disabled) {
  cursor: default;
  opacity: 0.65;
}

.prose :deep(.markdown-task-line[data-task-checked='true'] .markdown-task-content) {
  color: rgba(255, 255, 255, 0.55);
  text-decoration: line-through;
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

.prose :deep(pre.mermaid) {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  align-items: center;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 255, 255, 0.82);
}

.prose :deep(pre.mermaid svg) {
  width: 100%;
  max-width: 100%;
  height: auto;
}

.prose :deep(.mermaid-error-label) {
  align-self: stretch;
  color: rgba(255, 184, 184, 0.9);
  font-family:
    'Geist',
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  font-weight: 600;
}

.prose :deep(.mermaid-error-detail),
.prose :deep(.mermaid-error-source) {
  align-self: stretch;
  white-space: pre-wrap;
  word-break: break-word;
}

.prose :deep(.mermaid-error-detail) {
  color: rgba(255, 184, 184, 0.75);
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
