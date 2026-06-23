<script setup lang="ts">
import type { Component } from 'vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { resolveFileIconName, type FileIconName } from './file-icon-resolver'
import IconChevronRight from './icons/IconChevronRight.vue'
import IconFile from './icons/IconFile.vue'
import SidebarSearchButton from './SidebarSearchButton.vue'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'

interface TreeNode {
  name: string
  relPath: string
  isFolder: boolean
  depth: number
  children: TreeNode[]
}

interface TreeConnector {
  key: string
  depth: number
  startIndex: number
  rowCount: number
}

const TREE_DEPTH_INDENT_EM = 2.6667
const TREE_DEPTH_INDENT_PX = 32
const CHEVRON_CENTER_PX = 7
const TREE_ROW_FONT_SIZE_PX = 12
const TREE_ROW_PADDING_LEFT_EM = 0.25
const TREE_ROW_PADDING_LEFT_PX = TREE_ROW_FONT_SIZE_PX * TREE_ROW_PADDING_LEFT_EM
const TREE_ROW_HEIGHT_PX = 26
const TREE_PADDING_X_PX = 12
const TREE_PADDING_Y_PX = 8
const TREE_CONNECTOR_OVERHANG_PX = 2

const FILE_ICON_COMPONENTS: Record<FileIconName, Component> = {
  file: IconFile
}

const viewer = useViewerStore()
const workspace = useWorkspaceStore()
const emit = defineEmits<{
  openSearch: []
}>()
const expanded = ref<Set<string>>(new Set())
const focusedIndex = ref(0)
const rootEl = ref<HTMLElement | null>(null)

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = {
    name: '',
    relPath: '',
    isFolder: true,
    depth: -1,
    children: []
  }

  for (const relPath of paths) {
    const parts = relPath.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const segment = parts[i]
      const childRel = parts.slice(0, i + 1).join('/')
      let next = current.children.find((c) => c.name === segment)
      if (!next) {
        next = {
          name: segment,
          relPath: childRel,
          isFolder: !isLast,
          depth: i,
          children: []
        }
        current.children.push(next)
      }
      current = next
    }
  }

  function sortRec(node: TreeNode): void {
    node.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const child of node.children) {
      if (child.isFolder) sortRec(child)
    }
  }
  sortRec(root)
  return root.children
}

const tree = computed<TreeNode[]>(() => {
  if (!viewer.notesRoot || viewer.tree.length === 0) return []
  return buildTree(viewer.tree)
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
  tree,
  (next) => {
    if (next.length === 0) return
    // Default-expand all root-level folders so the user sees structure on first load.
    const nextExpanded = new Set(expanded.value)
    for (const node of next) {
      if (node.isFolder) nextExpanded.add(node.relPath)
    }
    expanded.value = nextExpanded
  },
  { immediate: true }
)

function isExpanded(node: TreeNode): boolean {
  return expanded.value.has(node.relPath)
}

function toggle(node: TreeNode): void {
  const next = new Set(expanded.value)
  if (next.has(node.relPath)) {
    next.delete(node.relPath)
  } else {
    next.add(node.relPath)
  }
  expanded.value = next
}

function onRowClick(node: TreeNode, index: number): void {
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

function onKeydown(event: KeyboardEvent): void {
  const rows = visibleRows.value
  if (rows.length === 0) return
  const current = rows[focusedIndex.value]

  switch (event.key) {
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
  // Hydration is done in App.vue before mount; nothing to fetch here.
})
</script>

<template>
  <nav
    ref="rootEl"
    class="sidebar ryte-scrollbar ryte-scrollbar--y"
    :aria-label="'Notes file tree'"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div class="sidebar-search">
      <SidebarSearchButton @search="emit('openSearch')" />
    </div>

    <p v-if="!viewer.notesRoot" class="empty-sidebar">Loading…</p>
    <p v-else-if="visibleRows.length === 0" class="empty-sidebar">
      No markdown files in <code>{{ viewer.notesRoot }}</code>
    </p>
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
              focused: focusedIndex === index,
              selected: !node.isFolder && viewer.sourcePath === node.relPath
            }
          ]"
          :style="rowStyle(node)"
          @click="onRowClick(node, index)"
        >
          <span v-if="node.isFolder" class="chevron" :class="{ open: isExpanded(node) }">
            <IconChevronRight />
          </span>
          <component :is="fileIconFor(node.name)" v-else class="file-icon" aria-hidden="true" />
          <span class="name">{{ node.name }}</span>
        </li>
      </ul>
    </div>
  </nav>
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

.sidebar-search {
  padding: 10px 12px 12px;
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
  gap: 0.667rem;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
