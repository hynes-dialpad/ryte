export const WORKSPACE_SCHEMA_VERSION = 2

export const SIDEBAR_DEFAULT_WIDTH = 360
export const SIDEBAR_MIN_WIDTH = 164
export const SIDEBAR_MAX_VIEWPORT_FRACTION = 0.5
export const SIDEBAR_AUTO_COLLAPSE_WIDTH = 640

export const DEFAULT_WINDOW_WIDTH = 1460
export const DEFAULT_WINDOW_HEIGHT = 980
export const MIN_WINDOW_WIDTH = 480
export const MIN_WINDOW_HEIGHT = 680
export const WORKSPACE_RECENTS_LIMIT = 25

export type WorkspaceViewMode = 'preview' | 'source'
export type WorkspaceSidebarMode = 'files' | 'home'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WorkspaceShellState {
  sidebarCollapsed: boolean
  sidebarWidth: number
  activeSidebar: WorkspaceSidebarMode
}

export interface WorkspaceWindowState {
  bounds: WindowBounds | null
  maximized: boolean
  fullscreen: boolean
}

export interface WorkspaceFileTab {
  id: string
  sourcePath: string
  title: string
  viewMode: WorkspaceViewMode
}

export interface WorkspaceRecentFile {
  sourcePath: string
  title: string
  openedAt: string
}

export interface WorkspaceState {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION
  shell: WorkspaceShellState
  window: WorkspaceWindowState
  tabs: WorkspaceFileTab[]
  activeTabId: string | null
  recents: WorkspaceRecentFile[]
  outlineCollapsedByPath: Record<string, boolean>
}

export interface WorkspaceShellUpdate {
  sidebarCollapsed?: boolean
  sidebarWidth?: number
  activeSidebar?: WorkspaceSidebarMode
}

export interface WorkspaceWindowUpdate {
  bounds?: WindowBounds | null
  maximized?: boolean
  fullscreen?: boolean
}

export interface WorkspaceOpenFileInput {
  sourcePath: string
}

export interface WorkspaceFocusTabInput {
  tabId: string
}

export interface WorkspaceCloseTabInput {
  tabId: string
}

export interface WorkspaceUpdateTabViewModeInput {
  tabId: string
  viewMode: WorkspaceViewMode
}

export interface WorkspaceRecordRecentInput {
  sourcePath: string
}

export interface WorkspaceSetOutlineCollapsedInput {
  sourcePath: string
  collapsed: boolean
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth * SIDEBAR_MAX_VIEWPORT_FRACTION)
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), maxWidth)
}

export function shouldAutoCollapseSidebar(viewportWidth: number): boolean {
  return viewportWidth < SIDEBAR_AUTO_COLLAPSE_WIDTH
}
