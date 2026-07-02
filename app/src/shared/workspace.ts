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

export interface WorkspaceSourceFileRef {
  sourcePath: string
  externalPath?: never
}

export interface WorkspaceExternalFileRef {
  externalPath: string
  sourcePath?: never
}

export type WorkspaceFileRef = WorkspaceSourceFileRef | WorkspaceExternalFileRef

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

export type WorkspaceFileTab = WorkspaceFileRef & {
  id: string
  title: string
  viewMode: WorkspaceViewMode
}

export type WorkspaceRecentFile = WorkspaceFileRef & {
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

export type WorkspaceOpenFileInput = WorkspaceSourceFileRef

export type WorkspaceOpenRecentFileInput = WorkspaceFileRef

export interface WorkspaceTabFileInput {
  tabId: string
}

export interface WorkspaceRecordRecentInput {
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

export interface WorkspaceSetOutlineCollapsedInput {
  sourcePath: string
  collapsed: boolean
}

export function isWorkspaceSourceFileRef(file: WorkspaceFileRef): file is WorkspaceSourceFileRef {
  return typeof file.sourcePath === 'string'
}

export function isWorkspaceExternalFileRef(
  file: WorkspaceFileRef
): file is WorkspaceExternalFileRef {
  return typeof file.externalPath === 'string'
}

export function workspaceFileDisplayPath(file: WorkspaceFileRef): string {
  return isWorkspaceSourceFileRef(file) ? file.sourcePath : file.externalPath
}

export function workspaceFileKey(file: WorkspaceFileRef): string {
  return isWorkspaceSourceFileRef(file)
    ? `source:${file.sourcePath}`
    : `external:${file.externalPath}`
}

export function workspaceFileTitle(file: WorkspaceFileRef): string {
  const displayPath = workspaceFileDisplayPath(file)
  const parts = displayPath.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? displayPath
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth * SIDEBAR_MAX_VIEWPORT_FRACTION)
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), maxWidth)
}

export function shouldAutoCollapseSidebar(viewportWidth: number): boolean {
  return viewportWidth < SIDEBAR_AUTO_COLLAPSE_WIDTH
}
