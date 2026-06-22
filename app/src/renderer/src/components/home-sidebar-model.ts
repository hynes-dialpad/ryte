import type { WorkspaceFileTab, WorkspaceRecentFile } from '../../../shared/workspace'

export interface HomeSidebarRecentItem {
  kind: 'recent'
  id: string
  sourcePath: string
  title: string
  active: boolean
}

export interface HomeSidebarOpenItem {
  kind: 'open'
  id: string
  tabId: string
  sourcePath: string
  title: string
  active: boolean
}

export interface HomeSidebarModel {
  recentItems: HomeSidebarRecentItem[]
  openItems: HomeSidebarOpenItem[]
}

function titleFromSourcePath(sourcePath: string): string {
  const parts = sourcePath.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? sourcePath
}

function displayTitle(title: string, sourcePath: string): string {
  return title.trim() || titleFromSourcePath(sourcePath)
}

export function buildHomeSidebarModel(input: {
  recents: WorkspaceRecentFile[]
  tabs: WorkspaceFileTab[]
  activeTabId: string | null
}): HomeSidebarModel {
  const activeTab = input.tabs.find((tab) => tab.id === input.activeTabId) ?? null
  const activeSourcePath = activeTab?.sourcePath ?? null

  return {
    recentItems: input.recents.map((recent) => ({
      kind: 'recent',
      id: `recent:${recent.sourcePath}`,
      sourcePath: recent.sourcePath,
      title: displayTitle(recent.title, recent.sourcePath),
      active: recent.sourcePath === activeSourcePath
    })),
    openItems: input.tabs.map((tab) => ({
      kind: 'open',
      id: `open:${tab.id}`,
      tabId: tab.id,
      sourcePath: tab.sourcePath,
      title: displayTitle(tab.title, tab.sourcePath),
      active: tab.id === input.activeTabId
    }))
  }
}
