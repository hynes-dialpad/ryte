import type { WorkspaceFileTab, WorkspaceRecentFile } from '../../../shared/workspace'

export type HomeSmartGroupId = 'open' | 'recent'

export type HomeSmartGroupItemAction =
  | {
      kind: 'open-explicit-file'
      sourcePath: string
    }
  | {
      kind: 'focus-tab'
      tabId: string
    }

export interface HomeSmartGroupItem {
  id: string
  sourcePath: string
  title: string
  active: boolean
  ariaLabel: string
  action: HomeSmartGroupItemAction
}

export interface HomeSmartGroup {
  id: HomeSmartGroupId
  title: string
  headingId: string
  emptyLabel: string
  items: HomeSmartGroupItem[]
}

export interface HomeSidebarModel {
  groups: HomeSmartGroup[]
}

interface HomeSidebarModelInput {
  recents: WorkspaceRecentFile[]
  tabs: WorkspaceFileTab[]
  activeTabId: string | null
}

interface HomeSidebarModelContext extends HomeSidebarModelInput {
  activeSourcePath: string | null
  openSourcePaths: Set<string>
}

interface HomeSmartGroupDefinition {
  id: HomeSmartGroupId
  title: string
  emptyLabel: string
  buildItems: (context: HomeSidebarModelContext) => HomeSmartGroupItem[]
}

function titleFromSourcePath(sourcePath: string): string {
  const parts = sourcePath.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? sourcePath
}

function displayTitle(title: string, sourcePath: string): string {
  return title.trim() || titleFromSourcePath(sourcePath)
}

const HOME_SMART_GROUP_DEFINITIONS: HomeSmartGroupDefinition[] = [
  {
    id: 'open',
    title: 'Open',
    emptyLabel: 'No open files',
    buildItems: (context) =>
      context.tabs.map((tab) => ({
        id: `open:${tab.id}`,
        sourcePath: tab.sourcePath,
        title: displayTitle(tab.title, tab.sourcePath),
        active: tab.id === context.activeTabId,
        ariaLabel: `Focus ${tab.sourcePath}`,
        action: {
          kind: 'focus-tab',
          tabId: tab.id
        }
      }))
  },
  {
    id: 'recent',
    title: 'Recent',
    emptyLabel: 'No recent files',
    buildItems: (context) =>
      context.recents
        .filter((recent) => !context.openSourcePaths.has(recent.sourcePath))
        .map((recent) => ({
          id: `recent:${recent.sourcePath}`,
          sourcePath: recent.sourcePath,
          title: displayTitle(recent.title, recent.sourcePath),
          active: recent.sourcePath === context.activeSourcePath,
          ariaLabel: `Open ${recent.sourcePath}`,
          action: {
            kind: 'open-explicit-file',
            sourcePath: recent.sourcePath
          }
        }))
  }
]

export function buildHomeSidebarModel(input: HomeSidebarModelInput): HomeSidebarModel {
  const activeTab = input.tabs.find((tab) => tab.id === input.activeTabId) ?? null
  const activeSourcePath = activeTab?.sourcePath ?? null
  const context: HomeSidebarModelContext = {
    ...input,
    activeSourcePath,
    openSourcePaths: new Set(input.tabs.map((tab) => tab.sourcePath))
  }

  return {
    groups: HOME_SMART_GROUP_DEFINITIONS.map((definition) => ({
      id: definition.id,
      title: definition.title,
      headingId: `home-${definition.id}-heading`,
      emptyLabel: definition.emptyLabel,
      items: definition.buildItems(context)
    }))
  }
}
