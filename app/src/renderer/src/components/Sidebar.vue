<script setup lang="ts">
import type { Component } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import FileContextMenu from './FileContextMenu.vue'
import type { FileContextMenuAction } from './file-context-menu-model'
import { resolveFileIconName, type FileIconName } from './file-icon-resolver'
import IconCheck from './icons/IconCheck.vue'
import IconChevronRight from './icons/IconChevronRight.vue'
import IconFile from './icons/IconFile.vue'
import IconMoreVertical from './icons/IconMoreVertical.vue'
import InlineFileRename from './InlineFileRename.vue'
import {
  buildSidebarTree,
  modifiedAtMsBySourcePath,
  type SidebarTreeNode as TreeNode
} from './sidebar-tree-model'
import type { WorkspaceFolderSortMode } from '../../../shared/workspace'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'

interface TreeConnector {
  key: string
  depth: number
  startIndex: number
  rowCount: number
}

interface SidebarFileContextMenu {
  sourcePath: string
  name: string
  x: number
  y: number
}

interface SidebarInlineRename {
  sourcePath: string
}

const TREE_ROW_FONT_SIZE_PX = 12
const TREE_CHEVRON_WIDTH_PX = 14
const TREE_ROW_GAP_EM = 0.889
const TREE_DEPTH_INDENT_EM = TREE_CHEVRON_WIDTH_PX / TREE_ROW_FONT_SIZE_PX + TREE_ROW_GAP_EM
const TREE_DEPTH_INDENT_PX = TREE_DEPTH_INDENT_EM * TREE_ROW_FONT_SIZE_PX
const CHEVRON_CENTER_PX = TREE_CHEVRON_WIDTH_PX / 2
const TREE_ROW_PADDING_LEFT_EM = 0.25
const TREE_ROW_PADDING_LEFT_PX = TREE_ROW_FONT_SIZE_PX * TREE_ROW_PADDING_LEFT_EM
const TREE_ROW_HEIGHT_PX = 26
const TREE_PADDING_X_PX = 12
const TREE_PADDING_Y_PX = 8
const TREE_CONNECTOR_OVERHANG_PX = 2
const SORT_OPTIONS: Array<{ mode: WorkspaceFolderSortMode; label: string }> = [
  { mode: 'az', label: 'A-Z' },
  { mode: 'za', label: 'Z-A' },
  { mode: 'recency', label: 'Recency' }
]

const FILE_ICON_COMPONENTS: Record<FileIconName, Component> = {
  file: IconFile
}

const viewer = useViewerStore()
const workspace = useWorkspaceStore()
const catalog = useFileCatalogStore()
const expanded = ref<Set<string>>(new Set())
const focusedIndex = ref(0)
const treeHasFocus = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const openSortMenuFor = ref<string | null>(null)
const fileContextMenu = ref<SidebarFileContextMenu | null>(null)
const inlineRename = ref<SidebarInlineRename | null>(null)
let activeSourcePathInitialized = false
let libraryScrollRestored = false
let restoringLibraryScroll = false
let scrollPersistTimer: number | null = null

const tree = computed<TreeNode[]>(() => {
  if (!viewer.notesRoot || viewer.tree.length === 0) return []
  return buildSidebarTree(
    viewer.tree,
    workspace.library.folderSortModes,
    modifiedAtMsBySourcePath(catalog.files)
  )
})

function flatten(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const node of nodes) {
    out.push(node)
    if (node.isFolder && expanded.value.has(node.relPath)) {
      flatten(node.children, out)
    }
  }
  return out
}

const visibleRows = computed<TreeNode[]>(() => flatten(tree.value))

const treeConnectors = computed<TreeConnector[]>(() => {
  const rows = visibleRows.value
  const connectors: TreeConnector[] = []

  for (const [index, row] of rows.entries()) {
    if (!row.isFolder || !isExpanded(row)) continue

    let lastDescendantIndex = index
    while (
      lastDescendantIndex + 1 < rows.length &&
      rows[lastDescendantIndex + 1].depth > row.depth
    ) {
      lastDescendantIndex++
    }

    const rowCount = lastDescendantIndex - index
    if (rowCount > 0) {
      connectors.push({
        key: row.relPath,
        depth: row.depth,
        startIndex: index + 1,
        rowCount
      })
    }
  }

  return connectors
})

watch(
  () => workspace.library.expandedFolders,
  (savedExpandedFolders) => {
    if (savedExpandedFolders === null) return
    expanded.value = new Set(savedExpandedFolders)
  },
  { immediate: true }
)

watch(
  tree,
  (next) => {
    if (next.length === 0) return
    if (workspace.library.expandedFolders !== null) {
      if (viewer.sourcePath) expandAncestorsForSourcePath(viewer.sourcePath)
      return
    }
    // Default-expand all root-level folders so the user sees structure on first load.
    const nextExpanded = new Set(expanded.value)
    for (const node of next) {
      if (node.isFolder) nextExpanded.add(node.relPath)
    }
    if (viewer.sourcePath) {
      const parts = viewer.sourcePath.split('/')
      parts.pop()
      for (let index = 0; index < parts.length; index += 1) {
        nextExpanded.add(parts.slice(0, index + 1).join('/'))
      }
    }
    expanded.value = nextExpanded
    persistExpandedFolders(nextExpanded)
  },
  { immediate: true }
)

watch(
  visibleRows,
  () => {
    void restoreLibraryScroll()
    syncFocusedIndexToSelectedRow()
  },
  { immediate: true, flush: 'post' }
)

watch(
  () => viewer.sourcePath,
  (sourcePath) => {
    if (!sourcePath) return
    if (tree.value.length === 0) return
    expandAncestorsForSourcePath(sourcePath)
    syncFocusedIndexToSelectedRow()
    if (activeSourcePathInitialized) {
      void scrollSelectedIntoView()
    }
    activeSourcePathInitialized = true
  },
  { immediate: true, flush: 'post' }
)

function isExpanded(node: TreeNode): boolean {
  return expanded.value.has(node.relPath)
}

function isTopLevelFolder(node: TreeNode): boolean {
  return node.isFolder && node.depth === 0
}

function sortModeFor(node: TreeNode): WorkspaceFolderSortMode {
  return workspace.library.folderSortModes[node.relPath] ?? 'az'
}

function toggleSortMenu(node: TreeNode): void {
  openSortMenuFor.value = openSortMenuFor.value === node.relPath ? null : node.relPath
}

function setFolderSortMode(node: TreeNode, mode: WorkspaceFolderSortMode): void {
  const folderSortModes = { ...workspace.library.folderSortModes }
  if (mode === 'az') {
    delete folderSortModes[node.relPath]
  } else {
    folderSortModes[node.relPath] = mode
  }
  openSortMenuFor.value = null
  void workspace.updateLibrary({ folderSortModes }).catch(() => {
    // The workspace store owns the user-facing error state for persistence failures.
  })
}

function openFileContextMenu(event: MouseEvent, node: TreeNode, index: number): void {
  if (node.isFolder) return
  focusedIndex.value = index
  openSortMenuFor.value = null
  inlineRename.value = null
  fileContextMenu.value = {
    sourcePath: node.relPath,
    name: node.name,
    x: event.clientX,
    y: event.clientY
  }
}

function startInlineRename(sourcePath: string): void {
  inlineRename.value = { sourcePath }
}

function cancelInlineRename(sourcePath: string): void {
  if (inlineRename.value?.sourcePath === sourcePath) inlineRename.value = null
}

async function submitInlineRename(node: TreeNode, name: string): Promise<void> {
  const editing = inlineRename.value
  if (!editing || editing.sourcePath !== node.relPath) return
  if (name === node.name) {
    inlineRename.value = null
    return
  }

  try {
    await workspace.renameFile({ sourcePath: node.relPath, name })
    inlineRename.value = null
    await Promise.all([viewer.refreshTree(), catalog.refreshCatalog()])
  } catch {
    // Keep the editor mounted; the workspace error is visible in the status bar.
  }
}

async function handleFileContextAction(action: FileContextMenuAction): Promise<void> {
  const menu = fileContextMenu.value
  if (!menu) return
  fileContextMenu.value = null
  const file = { sourcePath: menu.sourcePath }

  try {
    if (action === 'rename') {
      startInlineRename(menu.sourcePath)
      return
    }
    if (action === 'copy-file') {
      await workspace.copyFile(file)
      return
    }
    if (action === 'copy-file-path') {
      await workspace.copyFilePath(file)
      return
    }
    if (action === 'show-in-finder') {
      await workspace.showFileInFinder(file)
      return
    }
    if (action === 'move-to-trash' && (await workspace.moveFileToTrash(file))) {
      await Promise.all([viewer.refreshTree(), catalog.refreshCatalog()])
    }
  } catch {
    // The workspace store exposes the actionable error through the status bar.
  }
}

function sameStringList(left: string[] | null, right: string[]): boolean {
  if (left === null || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function sortedExpandedFolders(next: Set<string>): string[] {
  return [...next].sort((a, b) => a.localeCompare(b))
}

function persistExpandedFolders(next: Set<string>): void {
  const expandedFolders = sortedExpandedFolders(next)
  if (sameStringList(workspace.library.expandedFolders, expandedFolders)) return
  void workspace.updateLibrary({ expandedFolders }).catch(() => {
    // The workspace store owns the user-facing error state for persistence failures.
  })
}

function expandAncestorsForSourcePath(sourcePath: string): void {
  const parts = sourcePath.split('/')
  parts.pop()
  if (parts.length === 0) return

  const next = new Set(expanded.value)
  let changed = false
  for (let index = 0; index < parts.length; index += 1) {
    const ancestor = parts.slice(0, index + 1).join('/')
    if (next.has(ancestor)) continue
    next.add(ancestor)
    changed = true
  }

  if (!changed) return
  expanded.value = next
  persistExpandedFolders(next)
}

function toggle(node: TreeNode): void {
  const next = new Set(expanded.value)
  if (next.has(node.relPath)) {
    next.delete(node.relPath)
  } else {
    next.add(node.relPath)
  }
  expanded.value = next
  persistExpandedFolders(next)
}

function onRowClick(node: TreeNode, index: number): void {
  rootEl.value?.focus({ preventScroll: true })
  focusedIndex.value = index
  if (node.isFolder) {
    toggle(node)
  } else {
    void workspace.openOrFocusFile({ sourcePath: node.relPath })
  }
}

function rowStyle(node: TreeNode): Record<string, string> | undefined {
  if (node.depth <= 0) return undefined

  return {
    '--tree-depth-offset': `${node.depth * TREE_DEPTH_INDENT_EM}em`
  }
}

function fileIconFor(fileName: string): Component {
  return FILE_ICON_COMPONENTS[resolveFileIconName(fileName)]
}

function treeConnectorStyle(connector: TreeConnector): Record<string, string> {
  const top =
    TREE_PADDING_Y_PX + connector.startIndex * TREE_ROW_HEIGHT_PX - TREE_CONNECTOR_OVERHANG_PX
  const height = connector.rowCount * TREE_ROW_HEIGHT_PX + TREE_CONNECTOR_OVERHANG_PX * 2

  return {
    left: `${
      TREE_PADDING_X_PX +
      TREE_ROW_PADDING_LEFT_PX +
      connector.depth * TREE_DEPTH_INDENT_PX +
      CHEVRON_CENTER_PX
    }px`,
    top: `${top}px`,
    height: `${height}px`
  }
}

async function scrollFocusedIntoView(): Promise<void> {
  await nextTick()
  const el = rootEl.value?.querySelector<HTMLElement>(`[data-row-index="${focusedIndex.value}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

async function scrollSelectedIntoView(): Promise<void> {
  await nextTick()
  const sourcePath = viewer.sourcePath
  if (!sourcePath) return
  const selectedIndex = visibleRows.value.findIndex(
    (row) => !row.isFolder && row.relPath === sourcePath
  )
  if (selectedIndex === -1) return
  const el = rootEl.value?.querySelector<HTMLElement>(`[data-row-index="${selectedIndex}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

function syncFocusedIndexToSelectedRow(): void {
  const sourcePath = viewer.sourcePath
  if (!sourcePath) return
  const selectedIndex = visibleRows.value.findIndex(
    (row) => !row.isFolder && row.relPath === sourcePath
  )
  if (selectedIndex !== -1) focusedIndex.value = selectedIndex
}

async function restoreLibraryScroll(): Promise<void> {
  if (libraryScrollRestored || !rootEl.value || visibleRows.value.length === 0) return
  await nextTick()
  if (!rootEl.value) return
  restoringLibraryScroll = true
  rootEl.value.scrollTop = workspace.library.scrollTop
  libraryScrollRestored = true
  window.setTimeout(() => {
    restoringLibraryScroll = false
  }, 0)
}

function persistLibraryScroll(): void {
  const scrollTop = Math.round(rootEl.value?.scrollTop ?? 0)
  if (scrollTop === workspace.library.scrollTop) return
  void workspace.updateLibrary({ scrollTop }).catch(() => {
    // The workspace store owns the user-facing error state for persistence failures.
  })
}

function onScroll(): void {
  if (restoringLibraryScroll) return
  if (scrollPersistTimer !== null) {
    window.clearTimeout(scrollPersistTimer)
  }
  scrollPersistTimer = window.setTimeout(() => {
    scrollPersistTimer = null
    persistLibraryScroll()
  }, 150)
}

function onFocusIn(): void {
  treeHasFocus.value = true
}

function onFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && rootEl.value?.contains(nextTarget)) return
  treeHasFocus.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Element && target.closest('.sort-menu, .sort-menu-button')) return
  openSortMenuFor.value = null
  if (target instanceof Node && rootEl.value?.contains(target)) return
  treeHasFocus.value = false
  rootEl.value?.blur()
}

function onKeydown(event: KeyboardEvent): void {
  const rows = visibleRows.value
  if (rows.length === 0) return
  const current = rows[focusedIndex.value]

  switch (event.key) {
    case 'Escape':
      if (!openSortMenuFor.value) return
      event.preventDefault()
      openSortMenuFor.value = null
      break
    case 'ArrowDown':
      event.preventDefault()
      focusedIndex.value = Math.min(rows.length - 1, focusedIndex.value + 1)
      void scrollFocusedIntoView()
      break
    case 'ArrowUp':
      event.preventDefault()
      focusedIndex.value = Math.max(0, focusedIndex.value - 1)
      void scrollFocusedIntoView()
      break
    case 'ArrowRight':
      event.preventDefault()
      if (current?.isFolder && !isExpanded(current)) {
        toggle(current)
      }
      break
    case 'ArrowLeft':
      event.preventDefault()
      if (current?.isFolder && isExpanded(current)) {
        toggle(current)
      }
      break
    case 'Enter':
      event.preventDefault()
      if (current && !current.isFolder) {
        void workspace.openOrFocusFile({ sourcePath: current.relPath })
      } else if (current?.isFolder) {
        toggle(current)
      }
      break
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  void catalog.hydrate()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  catalog.unbind()
  if (scrollPersistTimer !== null) {
    window.clearTimeout(scrollPersistTimer)
    scrollPersistTimer = null
  }
  persistLibraryScroll()
})
</script>

<template>
  <nav
    ref="rootEl"
    class="sidebar ryte-scrollbar ryte-scrollbar--y"
    :aria-label="'Notes file tree'"
    tabindex="0"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @keydown="onKeydown"
    @scroll="onScroll"
  >
    <p v-if="!viewer.notesRoot" class="empty-sidebar">Loading…</p>
    <p v-else-if="visibleRows.length === 0" class="empty-sidebar">No markdown files found.</p>
    <div v-else class="tree-frame">
      <div class="tree-connectors" aria-hidden="true">
        <span
          v-for="connector in treeConnectors"
          :key="connector.key"
          class="tree-connector"
          :style="treeConnectorStyle(connector)"
        />
      </div>
      <ul role="tree" class="tree">
        <li
          v-for="(node, index) in visibleRows"
          :key="node.relPath"
          role="treeitem"
          :aria-expanded="node.isFolder ? isExpanded(node) : undefined"
          :aria-current="!node.isFolder && viewer.sourcePath === node.relPath ? 'true' : undefined"
          :data-row-index="index"
          :class="[
            'row',
            {
              folder: node.isFolder,
              file: !node.isFolder,
              focused: treeHasFocus && focusedIndex === index,
              selected: !node.isFolder && viewer.sourcePath === node.relPath
            }
          ]"
          :style="rowStyle(node)"
          @click="onRowClick(node, index)"
          @contextmenu.prevent.stop="openFileContextMenu($event, node, index)"
        >
          <span v-if="node.isFolder" class="chevron" :class="{ open: isExpanded(node) }">
            <IconChevronRight />
          </span>
          <component :is="fileIconFor(node.name)" v-else class="file-icon" aria-hidden="true" />
          <InlineFileRename
            v-if="!node.isFolder && inlineRename?.sourcePath === node.relPath"
            :name="node.name"
            :label="`Rename ${node.name}`"
            variant="sidebar"
            @submit="submitInlineRename(node, $event)"
            @cancel="cancelInlineRename(node.relPath)"
          />
          <span v-else class="name">{{ node.name }}</span>
          <button
            v-if="isTopLevelFolder(node)"
            type="button"
            class="sort-menu-button"
            :class="{ open: openSortMenuFor === node.relPath }"
            :aria-label="`Sort ${node.name}`"
            aria-haspopup="menu"
            :aria-expanded="openSortMenuFor === node.relPath"
            @click.stop="toggleSortMenu(node)"
          >
            <IconMoreVertical />
          </button>
          <div
            v-if="isTopLevelFolder(node) && openSortMenuFor === node.relPath"
            class="sort-menu"
            role="menu"
            :aria-label="`Sort ${node.name}`"
            @click.stop
            @keydown.stop
          >
            <div class="sort-menu-title">Sort by</div>
            <button
              v-for="option in SORT_OPTIONS"
              :key="option.mode"
              type="button"
              class="sort-menu-item"
              :class="{ active: sortModeFor(node) === option.mode }"
              role="menuitemradio"
              :aria-checked="sortModeFor(node) === option.mode"
              @click.stop="setFolderSortMode(node, option.mode)"
            >
              <span class="sort-menu-check" aria-hidden="true">
                <IconCheck v-if="sortModeFor(node) === option.mode" />
              </span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </li>
      </ul>
    </div>
  </nav>
  <FileContextMenu
    v-if="fileContextMenu"
    :x="fileContextMenu.x"
    :y="fileContextMenu.y"
    :file-name="fileContextMenu.name"
    @action="handleFileContextAction"
    @dismiss="fileContextMenu = null"
  />
</template>

<style scoped>
.sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  font-size: 0.825rem;
}

.sidebar:focus-visible {
  outline: 2px solid rgba(120, 200, 255, 0.4);
  outline-offset: -2px;
}

.empty-sidebar {
  padding: 1rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.empty-sidebar code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  word-break: break-all;
}

.tree-frame {
  position: relative;
}

.tree-connectors {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.tree {
  position: relative;
  z-index: 1;
  list-style: none;
  margin: 0;
  padding: 8px 12px;
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.889em;
  padding-block: 0.583em;
  padding-right: 0.25em;
  padding-left: calc(0.25em + var(--tree-depth-offset, 0px));
  border-radius: 0.5em;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  height: 2.167em;
  line-height: 1.4;
}

.tree-connector {
  position: absolute;
  width: 1px;
  pointer-events: none;
  background: rgba(217, 217, 217, 0.25);
}

.row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.row.folder {
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.row.focused {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px #0496ff;
}

.row.selected {
  background: rgba(120, 200, 255, 0.16);
  color: white;
}

.row.selected.focused {
  background: rgba(120, 200, 255, 0.22);
}

.chevron {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: #fff;
  transition: transform 120ms;
}

.chevron.open {
  transform: rotate(90deg);
}

.file-icon {
  position: relative;
  z-index: 2;
  color: rgba(255, 255, 255, 0.75);
}

.name {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sort-menu-button {
  position: relative;
  z-index: 3;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-block: -3px;
  margin-left: auto;
  border: 0;
  border-radius: 0.3em;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}

.row:hover .sort-menu-button,
.row:focus-within .sort-menu-button,
.sort-menu-button.open {
  opacity: 1;
  pointer-events: auto;
}

.sort-menu-button:hover,
.sort-menu-button.open,
.sort-menu-button:focus-visible {
  background: rgba(255, 255, 255, 0.18);
  color: white;
}

.sort-menu-button:focus-visible {
  outline: 2px solid #2d8cff;
  outline-offset: 1px;
}

.sort-menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0.25rem;
  z-index: 20;
  min-width: 11.75rem;
  padding: 0.625rem 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 0.75rem;
  background: #fff;
  box-shadow:
    0 1.25rem 3rem rgba(0, 0, 0, 0.22),
    0 0.25rem 1rem rgba(0, 0, 0, 0.16);
  color: #111;
}

.sort-menu-title {
  padding: 0.25rem 1rem 0.375rem 2.375rem;
  color: #555;
  font-size: 0.75rem;
  font-weight: 700;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 2.25rem;
  padding-block: 0.5em;
  padding-inline: 1rem;
  border: 0;
  background: transparent;
  color: #111;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}

.sort-menu-item:hover,
.sort-menu-item:focus-visible {
  background: rgba(0, 0, 0, 0.06);
  outline: none;
}

.sort-menu-item.active {
  color: #0087e8;
}

.sort-menu-check {
  flex: 0 0 1.375rem;
  color: #0087e8;
}
</style>
