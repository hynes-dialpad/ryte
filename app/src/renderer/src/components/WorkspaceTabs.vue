<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'

import { useWorkspaceStore } from '../stores/workspace'

const TAB_MIN_WIDTH = 144
const TAB_MAX_WIDTH = 206
const TAB_GAP = 2

const workspace = useWorkspaceStore()

const hasTabs = computed(() => workspace.tabs.length > 0)
const tabListRef = ref<HTMLElement | null>(null)
const tabWidth = ref(TAB_MAX_WIDTH)
const scrollbarVisible = ref(false)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const tabElements = new Map<string, HTMLElement>()
let resizeObserver: ResizeObserver | null = null
let scrollFrame: number | null = null

const tabListStyle = computed(() => ({
  '--workspace-tab-width': `${tabWidth.value}px`
}))
const tabListClasses = computed(() => ({
  'has-left-fade': canScrollLeft.value,
  'has-right-fade': canScrollRight.value
}))

function setTabListRef(element: Element | ComponentPublicInstance | null): void {
  tabListRef.value = element instanceof HTMLElement ? element : null
}

function setTabElement(tabId: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) {
    tabElements.set(tabId, element)
    return
  }
  tabElements.delete(tabId)
}

function updateTabWidth(): void {
  const list = tabListRef.value
  const tabCount = workspace.tabs.length
  if (!list || tabCount === 0) {
    tabWidth.value = TAB_MAX_WIDTH
    return
  }

  const gapsWidth = Math.max(0, tabCount - 1) * TAB_GAP
  const availableWidth = Math.max(0, list.clientWidth - gapsWidth)
  const fittedWidth = Math.floor(availableWidth / tabCount)
  tabWidth.value = Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, fittedWidth))
}

function scrollActiveTabIntoView(): void {
  const list = tabListRef.value
  const activeTabId = workspace.activeTabId
  const activeTab = activeTabId ? tabElements.get(activeTabId) : null
  if (!list || !activeTab) return

  const listRect = list.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()
  const leftOverflow = tabRect.left - listRect.left
  const rightOverflow = tabRect.right - listRect.right

  if (leftOverflow < 0) {
    list.scrollLeft += leftOverflow
  } else if (rightOverflow > 0) {
    list.scrollLeft += rightOverflow
  }
}

function updateScrollEdges(): void {
  const list = tabListRef.value
  if (!list) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }

  const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth)
  canScrollLeft.value = list.scrollLeft > 1
  canScrollRight.value = list.scrollLeft < maxScrollLeft - 1
}

function syncTabLayout(): void {
  if (scrollFrame !== null) {
    window.cancelAnimationFrame(scrollFrame)
  }

  void nextTick(() => {
    if (scrollFrame !== null) {
      window.cancelAnimationFrame(scrollFrame)
    }
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null
      updateTabWidth()
      scrollActiveTabIntoView()
      updateScrollEdges()
    })
  })
}

watch(
  () => tabListRef.value,
  (list) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (list) {
      resizeObserver = new ResizeObserver(syncTabLayout)
      resizeObserver.observe(list)
    }
    syncTabLayout()
  },
  { flush: 'post' }
)

watch(
  () => [workspace.activeTabId, workspace.tabs.map((tab) => tab.id).join('|')] as const,
  () => syncTabLayout(),
  { flush: 'post', immediate: true }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
})

function focusTab(tabId: string): void {
  if (workspace.activeTabId === tabId) return
  void workspace.focusTab({ tabId })
}

function closeTab(event: MouseEvent, tabId: string): void {
  event.stopPropagation()
  void workspace.closeTab({ tabId })
}
</script>

<template>
  <nav
    v-if="hasTabs"
    class="workspace-tabs"
    :class="{ 'scrollbar-is-visible': scrollbarVisible }"
    aria-label="Open files"
    @pointerenter="scrollbarVisible = true"
    @pointerleave="scrollbarVisible = false"
  >
    <div
      :ref="setTabListRef"
      class="tab-list"
      :class="tabListClasses"
      :style="tabListStyle"
      @scroll="updateScrollEdges"
    >
      <div class="tab-track" role="tablist" aria-label="Workspace tabs">
        <div
          v-for="tab in workspace.tabs"
          :key="tab.id"
          :ref="(element) => setTabElement(tab.id, element)"
          class="tab-item"
          :class="{ active: workspace.activeTabId === tab.id }"
        >
          <button
            type="button"
            class="tab-focus"
            role="tab"
            :aria-selected="workspace.activeTabId === tab.id"
            :title="tab.sourcePath"
            @click="focusTab(tab.id)"
          >
            <span class="tab-title">{{ tab.title }}</span>
          </button>
          <button
            type="button"
            class="tab-close"
            :aria-label="`Close ${tab.title}`"
            :title="`Close ${tab.title}`"
            @click="closeTab($event, tab.id)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 14 14"
              aria-hidden="true"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.25"
                d="m10.5 3.5-7 7m0-7 7 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.workspace-tabs {
  flex: 1 1 auto;
  align-self: stretch;
  display: flex;
  align-items: stretch;
  min-width: 0;
  padding-block-start: 8px;
  padding-inline-end: 16px;
  background: transparent;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.tab-list {
  --tab-fade-size: 24px;
  flex: 1 1 auto;
  min-width: 0;
  height: calc(100% - 2px);
  overflow-x: auto;
  overflow-y: hidden;
}

.tab-list.has-left-fade {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade-size),
    #000 100%
  );
  mask-image: linear-gradient(to right, transparent 0, #000 var(--tab-fade-size), #000 100%);
  mask-mode: alpha;
}

.tab-list.has-right-fade {
  -webkit-mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
  mask-mode: alpha;
}

.tab-list.has-left-fade.has-right-fade {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade-size),
    #000 calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade-size),
    #000 calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
  mask-mode: alpha;
}

.tab-list::-webkit-scrollbar {
  height: 4px;
}

.tab-list::-webkit-scrollbar-track {
  background: transparent;
}

.tab-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: transparent;
}

.workspace-tabs.scrollbar-is-visible .tab-list::-webkit-scrollbar-thumb,
.tab-list:focus-within::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.32);
}

.workspace-tabs.scrollbar-is-visible .tab-list::-webkit-scrollbar-thumb:hover,
.tab-list:focus-within::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.46);
}

.tab-track {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 2px;
  width: max-content;
}

.tab-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 var(--workspace-tab-width, calc(9.6rem + 52px));
  width: var(--workspace-tab-width, calc(9.6rem + 52px));
  min-width: 144px;
  max-width: calc(9.6rem + 52px);
  padding: 6px 8px 8px 16px;
  border-radius: 8px;
  background: rgba(10, 9, 11, 0);
  color: rgba(255, 255, 255, 0.75);
  transition-duration: 250ms;
  transition-property: background-color, color;
  transition-timing-function: ease-out;
}

.tab-item.active {
  color: #ffffff;
  background: rgba(10, 9, 11, 0.25);
}

.tab-focus {
  min-width: 0;
  flex: 0 1 auto;
  display: inline-flex;
  align-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.76rem;
  line-height: 120%;
  cursor: pointer;
}

.tab-focus:focus-visible,
.tab-close:focus-visible {
  outline: 2px solid rgba(120, 200, 255, 0.65);
  outline-offset: -2px;
}

.tab-item:hover {
  background: rgba(10, 9, 11, 0.35);
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.tab-item.active:hover {
  background: rgba(10, 9, 11, 0.35);
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.tab-title {
  display: block;
  min-width: 0;
  max-width: 9.6rem;
  direction: rtl;
  overflow: hidden;
  line-height: 120%;
  text-align: left;
  text-overflow: ellipsis;
  unicode-bidi: plaintext;
  white-space: nowrap;
}

.tab-close {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  padding: 4px;
  background: rgba(10, 9, 11, 0);
  color: rgba(255, 255, 255, 0.5);
  font: inherit;
  line-height: 120%;
  cursor: pointer;
}

.tab-item.active .tab-close {
  color: #ffffff;
}

.tab-close:hover {
  color: #ffffff;
  background: rgba(10, 9, 11, 0.9);
}

.tab-close svg {
  width: 14px;
  height: 14px;
  display: block;
}
</style>
