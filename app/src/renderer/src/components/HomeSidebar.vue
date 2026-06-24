<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useDocumentTitles } from '../composables/useDocumentTitles'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useWorkspaceStore } from '../stores/workspace'
import {
  buildHomeSidebarModel,
  homeSmartGroupItemTitle,
  type HomeSmartGroupId,
  type HomeSmartGroupItem
} from './home-sidebar-model'
import IconChevronRight from './icons/IconChevronRight.vue'
import SidebarSearchButton from './SidebarSearchButton.vue'

const emit = defineEmits<{
  openSearch: []
}>()

const workspace = useWorkspaceStore()
const catalog = useFileCatalogStore()
const model = computed(() =>
  buildHomeSidebarModel({
    catalogFiles: catalog.files,
    recents: workspace.recents,
    tabs: workspace.tabs,
    activeTabId: workspace.activeTabId
  })
)
const collapsedGroupIds = ref<Set<HomeSmartGroupId>>(new Set())
const catalogSourcePaths = computed(() => new Set(catalog.files.map((file) => file.sourcePath)))
const showInitialLoadingState = computed(() => catalog.loading && catalog.files.length === 0)
const showBlockingErrorState = computed(() => catalog.error !== null && catalog.files.length === 0)
const showRefreshErrorState = computed(() => catalog.error !== null && catalog.files.length > 0)

function isGroupExpanded(groupId: HomeSmartGroupId): boolean {
  return !collapsedGroupIds.value.has(groupId)
}

function toggleGroup(groupId: HomeSmartGroupId): void {
  const nextGroupIds = new Set(collapsedGroupIds.value)
  if (nextGroupIds.has(groupId)) {
    nextGroupIds.delete(groupId)
  } else {
    nextGroupIds.add(groupId)
  }
  collapsedGroupIds.value = nextGroupIds
}

const visibleSourcePaths = computed(() => {
  const paths: string[] = []
  const seen = new Set<string>()

  for (const group of model.value.groups) {
    if (!isGroupExpanded(group.id)) continue
    for (const item of group.items) {
      if (seen.has(item.sourcePath)) continue
      seen.add(item.sourcePath)
      paths.push(item.sourcePath)
    }
  }

  return paths
})

const uncatalogedVisibleSourcePaths = computed(() =>
  visibleSourcePaths.value.filter((sourcePath) => !catalogSourcePaths.value.has(sourcePath))
)
const documentTitles = useDocumentTitles(
  uncatalogedVisibleSourcePaths,
  computed(() => catalog.revision)
)

onMounted(() => {
  void catalog.hydrate()
})

onUnmounted(() => {
  catalog.unbind()
})

function itemTitle(item: HomeSmartGroupItem): string {
  return homeSmartGroupItemTitle(item, documentTitles.value[item.sourcePath])
}

function activateItem(item: HomeSmartGroupItem): void {
  void workspace.openExplicitFile({ sourcePath: item.action.sourcePath })
}
</script>

<template>
  <nav class="home-sidebar ryte-scrollbar ryte-scrollbar--y" aria-label="Home sidebar">
    <div class="home-search">
      <SidebarSearchButton @search="emit('openSearch')" />
    </div>

    <p v-if="showInitialLoadingState" class="home-state">Loading files...</p>
    <p v-else-if="showBlockingErrorState" class="home-state error">Could not load file list.</p>
    <p v-else-if="showRefreshErrorState" class="home-state error">Could not refresh file list.</p>

    <template v-if="!showInitialLoadingState && !showBlockingErrorState">
      <section
        v-for="group in model.groups"
        :key="group.id"
        class="home-section"
        :class="{ expanded: isGroupExpanded(group.id) && group.items.length > 0 }"
        :aria-labelledby="group.headingId"
      >
        <h2 :id="group.headingId" class="home-heading">
          <button
            type="button"
            class="home-group-toggle"
            :aria-expanded="isGroupExpanded(group.id)"
            :aria-controls="`${group.id}-home-list`"
            @click="toggleGroup(group.id)"
          >
            <span class="group-chevron" :class="{ open: isGroupExpanded(group.id) }">
              <IconChevronRight />
            </span>
            <span>{{ group.title }}</span>
          </button>
        </h2>
        <p v-if="isGroupExpanded(group.id) && group.items.length === 0" class="home-empty">
          {{ group.emptyLabel }}
        </p>
        <ul v-else-if="isGroupExpanded(group.id)" :id="`${group.id}-home-list`" class="home-list">
          <li v-for="item in group.items" :key="item.id">
            <div class="home-row-frame">
              <button
                type="button"
                class="home-row"
                :class="{ active: item.active }"
                :title="item.sourcePath"
                :aria-current="item.active ? 'page' : undefined"
                :aria-label="item.ariaLabel"
                @click="activateItem(item)"
              >
                <span class="row-copy">
                  <span class="row-title">{{ itemTitle(item) }}</span>
                  <span class="row-path">{{ item.sourcePath }}</span>
                </span>
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </nav>
</template>

<style scoped>
.home-sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  font-size: 0.825rem;
}

.home-sidebar:focus-within {
  outline: none;
}

.home-search {
  padding: 10px 12px 12px;
}

.home-section {
  position: relative;
  padding: 8px 12px;
}

.home-state {
  margin: 0 12px 8px;
  border-radius: 8px;
  padding: 8px 10px;
  color: rgba(255, 255, 255, 0.44);
  font-size: 12px;
  line-height: 1.35;
}

.home-state.error {
  color: rgba(255, 184, 184, 0.78);
  background: rgba(255, 92, 92, 0.08);
}

.home-section.expanded::before {
  content: '';
  position: absolute;
  top: 32px;
  bottom: 6px;
  left: 22px;
  z-index: 2;
  width: 1px;
  pointer-events: none;
  background: rgba(217, 217, 217, 0.25);
}

.home-heading {
  margin: 0;
  text-transform: uppercase;
}

.home-group-toggle {
  position: relative;
  width: 100%;
  height: 2.167em;
  display: flex;
  align-items: center;
  gap: 0.667rem;
  border: 0;
  border-radius: 0.5em;
  box-sizing: border-box;
  padding-block: 0.583em;
  padding-right: 0.25em;
  padding-left: 0.25em;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.home-group-toggle:hover,
.home-group-toggle:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  outline: 0;
}

.group-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: #fff;
  transition: transform 120ms;
}

.group-chevron.open {
  transform: rotate(90deg);
}

.home-empty {
  margin: 0;
  padding: 8px 28px 10px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.78rem;
  line-height: 1.35;
}

.home-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.home-row-frame {
  position: relative;
}

.home-row {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  padding: 6px 28px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.home-row:hover,
.home-row:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  outline: 0;
}

.home-row.active {
  background: rgba(120, 200, 255, 0.22);
  box-shadow: inset 0 0 0 1px #0496ff;
  color: white;
}

.row-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.row-title,
.row-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title {
  color: inherit;
  font-size: 0.82rem;
  line-height: 1.25;
}

.row-path {
  color: rgba(255, 255, 255, 0.42);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.67rem;
  line-height: 1.25;
}

.home-row:hover .row-path,
.home-row:focus-visible .row-path,
.home-row.active .row-path {
  color: rgba(255, 255, 255, 0.62);
}
</style>
