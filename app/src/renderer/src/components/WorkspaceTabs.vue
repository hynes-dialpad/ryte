<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComponentPublicInstance
} from 'vue'

import { useWorkspaceStore } from '../stores/workspace'
import {
  WORKSPACE_TABPANEL_ID,
  getCloseFallbackWorkspaceTabId,
  getWorkspaceTabDomId,
  resolveGlobalWorkspaceTabShortcut,
  resolveTablistKeyboardAction
} from './workspace-tab-keyboard'
import { resolveOverflowEdges, resolveScrollDelta } from './workspace-tab-scroll'

const workspace = useWorkspaceStore()
const TAB_SCROLL_MARGIN = 8

const hasTabs = computed(() => workspace.tabs.length > 0)
const tabListRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const screenReaderStatus = ref('')
const tabElements = new Map<string, HTMLElement>()
const tabButtonElements = new Map<string, HTMLButtonElement>()
let resizeObserver: ResizeObserver | null = null
let scrollFrame: number | null = null

const tabIds = computed(() => workspace.tabs.map((tab) => tab.id))
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

function setTabButtonElement(
  tabId: string,
  element: Element | ComponentPublicInstance | null
): void {
  if (element instanceof HTMLButtonElement) {
    tabButtonElements.set(tabId, element)
    return
  }
  tabButtonElements.delete(tabId)
}

function focusTabButton(tabId: string): void {
  void nextTick(() => {
    tabButtonElements.get(tabId)?.focus()
  })
}

function scrollTabIntoView(tabId: string): void {
  const list = tabListRef.value
  const tab = tabElements.get(tabId)
  if (!list || !tab) return

  const listRect = list.getBoundingClientRect()
  const tabRect = tab.getBoundingClientRect()
  const delta = resolveScrollDelta({
    viewportStart: listRect.left,
    viewportEnd: listRect.right,
    itemStart: tabRect.left,
    itemEnd: tabRect.right,
    margin: TAB_SCROLL_MARGIN
  })

  if (delta !== 0) list.scrollLeft += delta
  updateScrollEdges()
}

function updateScrollEdges(): void {
  const list = tabListRef.value
  if (!list) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }

  const edges = resolveOverflowEdges({
    scrollLeft: list.scrollLeft,
    scrollWidth: list.scrollWidth,
    clientWidth: list.clientWidth
  })
  canScrollLeft.value = edges.canScrollLeft
  canScrollRight.value = edges.canScrollRight
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
      if (workspace.activeTabId) scrollTabIntoView(workspace.activeTabId)
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

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
  window.removeEventListener('keydown', onGlobalKeydown, true)
})

function tabDomId(tabId: string): string {
  return getWorkspaceTabDomId(tabId)
}

function tabPanelId(): string {
  return WORKSPACE_TABPANEL_ID
}

function tabIndex(tabId: string): 0 | -1 {
  return workspace.activeTabId === tabId ? 0 : -1
}

function tabAccessibleLabel(title: string, sourcePath: string): string {
  return title === sourcePath ? title : `${title}, ${sourcePath}`
}

function announce(message: string): void {
  screenReaderStatus.value = ''
  void nextTick(() => {
    screenReaderStatus.value = message
  })
}

function isFocusInsideTabs(): boolean {
  const activeElement = document.activeElement
  return activeElement instanceof HTMLElement && Boolean(activeElement.closest('.workspace-tabs'))
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function hasModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

function focusFallbackShellControl(): void {
  document.querySelector<HTMLElement>('[data-workspace-fallback-focus]')?.focus()
}

function focusTab(
  tabId: string,
  options: { moveKeyboardFocus?: boolean; announceSelection?: boolean } = {}
): void {
  if (workspace.activeTabId === tabId) {
    void nextTick(() => {
      scrollTabIntoView(tabId)
      if (options.moveKeyboardFocus) {
        focusTabButton(tabId)
      }
    })
    return
  }
  void workspace.focusTab({ tabId })
  void nextTick(() => {
    scrollTabIntoView(tabId)
    if (options.moveKeyboardFocus) {
      focusTabButton(tabId)
    }
    if (options.announceSelection) {
      const selectedTab = workspace.tabs.find((tab) => tab.id === tabId)
      if (selectedTab) announce(`Selected ${selectedTab.sourcePath}`)
    }
  })
}

function closeTabWithFocusRecovery(
  tabId: string,
  options: { moveKeyboardFocus?: boolean; announceClose?: boolean } = {}
): void {
  const closingTab = workspace.tabs.find((tab) => tab.id === tabId)
  const fallbackTabId = getCloseFallbackWorkspaceTabId(tabIds.value, tabId)
  void workspace.closeTab({ tabId })
  void nextTick(() => {
    const shouldRecoverBodyFocus = document.activeElement === document.body
    if (fallbackTabId && (options.moveKeyboardFocus || shouldRecoverBodyFocus)) {
      focusTabButton(fallbackTabId)
      return
    }
    if (!fallbackTabId && (options.moveKeyboardFocus || shouldRecoverBodyFocus)) {
      focusFallbackShellControl()
    }
  })
  if (closingTab && options.announceClose) {
    announce(`Closed ${closingTab.sourcePath}`)
  }
}

function closeTab(event: MouseEvent, tabId: string): void {
  event.stopPropagation()
  const target = event.currentTarget
  const shouldRecoverFocus =
    target instanceof HTMLElement && (event.detail === 0 || document.activeElement === target)

  closeTabWithFocusRecovery(tabId, {
    moveKeyboardFocus: shouldRecoverFocus,
    announceClose: shouldRecoverFocus
  })
}

function onTabKeydown(event: KeyboardEvent, tabId: string): void {
  const action = resolveTablistKeyboardAction(event, tabIds.value, tabId)
  if (!action) return

  event.preventDefault()
  event.stopPropagation()

  if (action.type === 'close') {
    closeTabWithFocusRecovery(action.tabId, { moveKeyboardFocus: true, announceClose: true })
    return
  }

  focusTab(action.tabId, { moveKeyboardFocus: true })
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || isEditableKeyboardTarget(event.target) || hasModalOpen()) return

  const action = resolveGlobalWorkspaceTabShortcut(event, tabIds.value, workspace.activeTabId)
  if (!action) return

  event.preventDefault()
  event.stopPropagation()

  if (action.type === 'close-active') {
    if (workspace.activeTabId) {
      closeTabWithFocusRecovery(workspace.activeTabId, {
        moveKeyboardFocus: isFocusInsideTabs(),
        announceClose: true
      })
    }
    return
  }

  const focusStartedInsideTabs = isFocusInsideTabs()
  focusTab(action.tabId, {
    moveKeyboardFocus: true,
    announceSelection: !focusStartedInsideTabs
  })
}
</script>

<template>
  <nav v-if="hasTabs" class="workspace-tabs" aria-label="Open files">
    <p id="workspace-tabs-instructions" class="sr-only">
      Use Left and Right Arrow to switch tabs, Home and End to jump, Delete or Backspace to close
      the focused tab, Command W to close the current tab, or Shift Command Left Bracket and Shift
      Command Right Bracket to switch tabs from anywhere.
    </p>
    <div
      :ref="setTabListRef"
      class="tab-list ryte-scrollbar ryte-scrollbar--x"
      :class="tabListClasses"
      @scroll="updateScrollEdges"
    >
      <div
        class="tab-track"
        role="tablist"
        aria-label="Workspace tabs"
        aria-orientation="horizontal"
        aria-describedby="workspace-tabs-instructions"
      >
        <div
          v-for="tab in workspace.tabs"
          :key="tab.id"
          :ref="(element) => setTabElement(tab.id, element)"
          class="tab-item"
          :class="{ active: workspace.activeTabId === tab.id }"
          role="presentation"
        >
          <button
            :id="tabDomId(tab.id)"
            :ref="(element) => setTabButtonElement(tab.id, element)"
            type="button"
            class="tab-focus"
            role="tab"
            :aria-selected="workspace.activeTabId === tab.id"
            :aria-controls="tabPanelId()"
            :aria-label="tabAccessibleLabel(tab.title, tab.sourcePath)"
            aria-describedby="workspace-tabs-instructions"
            aria-keyshortcuts="ArrowLeft ArrowRight Home End Delete Backspace Enter Space Meta+W Meta+Shift+[ Meta+Shift+]"
            :tabindex="tabIndex(tab.id)"
            :title="tab.sourcePath"
            @click="focusTab(tab.id)"
            @keydown="onTabKeydown($event, tab.id)"
          >
            <span class="tab-title">{{ tab.title }}</span>
          </button>
          <button
            type="button"
            class="tab-close"
            :aria-label="`Close ${tab.sourcePath}`"
            :title="`Close ${tab.sourcePath}`"
            tabindex="-1"
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
    <span class="sr-only" aria-live="polite" aria-atomic="true">{{ screenReaderStatus }}</span>
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.tab-list {
  --tab-fade-size: 24px;
  --tab-scrollbar-strip: 6px;
  flex: 1 1 auto;
  min-width: 0;
  height: calc(100% - 2px);
  overflow-x: auto;
  overflow-y: hidden;
}

.tab-list.has-left-fade {
  --tab-edge-mask: linear-gradient(to right, transparent 0, #000 var(--tab-fade-size), #000 100%);
}

.tab-list.has-right-fade {
  --tab-edge-mask: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
}

.tab-list.has-left-fade.has-right-fade {
  --tab-edge-mask: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade-size),
    #000 calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
}

.tab-list.has-left-fade,
.tab-list.has-right-fade {
  -webkit-mask-image: var(--tab-edge-mask), linear-gradient(#000, #000);
  -webkit-mask-position:
    top left,
    bottom left;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size:
    100% calc(100% - var(--tab-scrollbar-strip)),
    100% var(--tab-scrollbar-strip);
  mask-image: var(--tab-edge-mask), linear-gradient(#000, #000);
  mask-mode: alpha;
  mask-position:
    top left,
    bottom left;
  mask-repeat: no-repeat;
  mask-size:
    100% calc(100% - var(--tab-scrollbar-strip)),
    100% var(--tab-scrollbar-strip);
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
  flex: 0 0 auto;
  min-width: 0;
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

.tab-item:focus-within {
  outline: 2px solid rgba(120, 200, 255, 0.65);
  outline-offset: -2px;
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
  outline: 0;
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

.tab-close:focus-visible {
  color: #ffffff;
  background: rgba(10, 9, 11, 0.9);
}

.tab-close svg {
  width: 14px;
  height: 14px;
  display: block;
}
</style>
