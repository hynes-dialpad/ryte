<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'

interface TreeNode {
  name: string
  relPath: string
  isFolder: boolean
  depth: number
  children: TreeNode[]
}

const viewer = useViewerStore()
const workspace = useWorkspaceStore()
const expanded = ref<Set<string>>(new Set())
const focusedIndex = ref(0)
const rootEl = ref<HTMLUListElement | null>(null)

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
    <p v-if="!viewer.notesRoot" class="empty-sidebar">Loading…</p>
    <p v-else-if="visibleRows.length === 0" class="empty-sidebar">
      No markdown files in <code>{{ viewer.notesRoot }}</code>
    </p>
    <ul v-else role="tree" class="tree">
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
        :style="{ paddingLeft: `${0.5 + node.depth * 0.9}rem` }"
        @click="onRowClick(node, index)"
      >
        <span v-if="node.isFolder" class="chevron" :class="{ open: isExpanded(node) }">▸</span>
        <span class="name">{{ node.name }}</span>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  background: rgba(0, 0, 0, 0.1);
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

.tree {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-top: 0.18rem;
  padding-bottom: 0.18rem;
  padding-right: 0.5rem;
  cursor: pointer;
  user-select: none;
  color: rgba(255, 255, 255, 0.78);
  line-height: 1.3;
}

.row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.row.folder {
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.row.focused {
  background: rgba(120, 200, 255, 0.08);
  box-shadow: inset 2px 0 0 rgba(120, 200, 255, 0.5);
}

.row.selected {
  background: rgba(120, 200, 255, 0.16);
  color: white;
}

.row.selected.focused {
  background: rgba(120, 200, 255, 0.22);
}

.chevron {
  display: inline-block;
  width: 0.7em;
  color: rgba(255, 255, 255, 0.5);
  transition: transform 120ms;
}

.chevron.open {
  transform: rotate(90deg);
}

.name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
