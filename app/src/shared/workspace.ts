export const WORKSPACE_SCHEMA_VERSION = 1

export const SIDEBAR_DEFAULT_WIDTH = 360
export const SIDEBAR_MIN_WIDTH = 164
export const SIDEBAR_MAX_VIEWPORT_FRACTION = 0.5
export const SIDEBAR_AUTO_COLLAPSE_WIDTH = 640
export const SIDEBAR_EDGE_TARGET_WIDTH = 32

export const DEFAULT_WINDOW_WIDTH = 1460
export const DEFAULT_WINDOW_HEIGHT = 980
export const MIN_WINDOW_WIDTH = 480
export const MIN_WINDOW_HEIGHT = 680

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WorkspaceShellState {
  sidebarCollapsed: boolean
  sidebarWidth: number
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
  viewMode: 'preview' | 'source'
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
}

export interface WorkspaceWindowUpdate {
  bounds?: WindowBounds | null
  maximized?: boolean
  fullscreen?: boolean
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth * SIDEBAR_MAX_VIEWPORT_FRACTION)
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), maxWidth)
}

export function shouldAutoCollapseSidebar(viewportWidth: number): boolean {
  return viewportWidth < SIDEBAR_AUTO_COLLAPSE_WIDTH
}
