import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
  win32
} from 'node:path'
import { randomUUID } from 'node:crypto'

import { walkNotes } from '../indexing/walker'
import { workspaceFilePath } from '../paths'
import { settingsStore } from '../settings/settings-store'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  WORKSPACE_RECENTS_LIMIT,
  WORKSPACE_SCHEMA_VERSION,
  type WindowBounds,
  type WorkspaceCloseTabInput,
  type WorkspaceFileTab,
  type WorkspaceFocusTabInput,
  type WorkspaceOpenFileInput,
  type WorkspaceRecentFile,
  type WorkspaceRecordRecentInput,
  type WorkspaceSetOutlineCollapsedInput,
  type WorkspaceShellState,
  type WorkspaceShellUpdate,
  type WorkspaceState,
  type WorkspaceUpdateTabViewModeInput,
  type WorkspaceViewMode,
  type WorkspaceWindowState,
  type WorkspaceWindowUpdate
} from '../../shared/workspace'

type LegacyWorkspaceFile = Partial<WorkspaceState> & {
  schemaVersion?: number
}

interface PendingWorkspaceWrite {
  state: WorkspaceState
  version: number
}

const WORKSPACE_WRITE_DEBOUNCE_MS = 75
const WORKSPACE_TAB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,199}$/

function defaultShellState(): WorkspaceShellState {
  return {
    sidebarCollapsed: false,
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH
  }
}

function defaultWindowState(): WorkspaceWindowState {
  return {
    bounds: null,
    maximized: false,
    fullscreen: false
  }
}

export function defaultWorkspaceState(): WorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    shell: defaultShellState(),
    window: defaultWindowState(),
    tabs: [],
    activeTabId: null,
    recents: [],
    outlineCollapsedByPath: {}
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeBounds(value: unknown): WindowBounds | null {
  if (value === null || value === undefined) return null
  if (!isObject(value)) return null
  const { x, y, width, height } = value
  if (!finiteNumber(x) || !finiteNumber(y) || !finiteNumber(width) || !finiteNumber(height)) {
    return null
  }
  if (width <= 0 || height <= 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}

function normalizeSidebarWidth(value: unknown): number {
  if (!finiteNumber(value)) return SIDEBAR_DEFAULT_WIDTH
  if (value < SIDEBAR_MIN_WIDTH) return SIDEBAR_MIN_WIDTH
  return Math.round(value)
}

function hasParentTraversal(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment === '..')
}

function normalizeSourcePath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    isAbsolute(value) ||
    win32.isAbsolute(value) ||
    hasParentTraversal(value)
  ) {
    return null
  }

  const normalized = normalize(value)
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('\0') ||
    isAbsolute(normalized) ||
    win32.isAbsolute(normalized) ||
    normalized.startsWith(`..${sep}`)
  ) {
    return null
  }

  return normalized
}

function requireSourcePath(value: string): string {
  const sourcePath = normalizeSourcePath(value)
  if (!sourcePath) throw new Error('Invalid workspace source path')
  return sourcePath
}

function normalizeTabId(value: unknown): string | null {
  if (typeof value !== 'string' || !WORKSPACE_TAB_ID_RE.test(value) || value.includes('\0')) {
    return null
  }
  return value
}

function requireTabId(value: string): string {
  const tabId = normalizeTabId(value)
  if (!tabId) throw new Error('Invalid workspace tab id')
  return tabId
}

function isWorkspaceViewMode(value: unknown): value is WorkspaceViewMode {
  return value === 'preview' || value === 'source'
}

function titleFromSourcePath(sourcePath: string): string {
  const parts = sourcePath.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? sourcePath
}

function normalizeTabs(value: unknown): WorkspaceFileTab[] {
  if (!Array.isArray(value)) return []
  const tabs: WorkspaceFileTab[] = []
  const seenIds = new Set<string>()

  for (const item of value) {
    if (!isObject(item)) continue
    const id = normalizeTabId(item.id)
    const sourcePath = normalizeSourcePath(item.sourcePath)
    if (!id || !sourcePath || !isWorkspaceViewMode(item.viewMode) || seenIds.has(id)) continue
    seenIds.add(id)
    tabs.push({
      id,
      sourcePath,
      title: titleFromSourcePath(sourcePath),
      viewMode: item.viewMode
    })
  }

  return tabs
}

function normalizeOpenedAt(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  return value
}

function normalizeRecents(value: unknown): WorkspaceRecentFile[] {
  if (!Array.isArray(value)) return []
  const recents: WorkspaceRecentFile[] = []
  const seenPaths = new Set<string>()

  for (const item of value) {
    if (!isObject(item)) continue
    const sourcePath = normalizeSourcePath(item.sourcePath)
    const openedAt = normalizeOpenedAt(item.openedAt)
    if (!sourcePath || !openedAt || seenPaths.has(sourcePath)) continue
    seenPaths.add(sourcePath)
    recents.push({
      sourcePath,
      title: titleFromSourcePath(sourcePath),
      openedAt
    })
    if (recents.length >= WORKSPACE_RECENTS_LIMIT) break
  }

  return recents
}

function normalizeOutlineCollapsedByPath(value: unknown): Record<string, boolean> {
  if (!isObject(value)) return {}
  const collapsedByPath: Record<string, boolean> = {}

  for (const [rawPath, collapsed] of Object.entries(value)) {
    const sourcePath = normalizeSourcePath(rawPath)
    if (!sourcePath || typeof collapsed !== 'boolean') continue
    collapsedByPath[sourcePath] = collapsed
  }

  return collapsedByPath
}

function repairActiveTabId(value: unknown, tabs: WorkspaceFileTab[]): string | null {
  if (typeof value === 'string' && tabs.some((tab) => tab.id === value)) return value
  return tabs[0]?.id ?? null
}

function recordRecentInState(state: WorkspaceState, sourcePath: string): WorkspaceRecentFile[] {
  return [
    {
      sourcePath,
      title: titleFromSourcePath(sourcePath),
      openedAt: new Date().toISOString()
    },
    ...state.recents.filter((recent) => recent.sourcePath !== sourcePath)
  ].slice(0, WORKSPACE_RECENTS_LIMIT)
}

function normalizeWorkspace(parsed: LegacyWorkspaceFile): WorkspaceState {
  const defaults = defaultWorkspaceState()
  const shell: Partial<WorkspaceShellState> = isObject(parsed.shell) ? parsed.shell : {}
  const window: Partial<WorkspaceWindowState> = isObject(parsed.window) ? parsed.window : {}
  const tabs = normalizeTabs(parsed.tabs)

  return {
    ...defaults,
    shell: {
      sidebarCollapsed:
        typeof shell.sidebarCollapsed === 'boolean'
          ? shell.sidebarCollapsed
          : defaults.shell.sidebarCollapsed,
      sidebarWidth: normalizeSidebarWidth(shell.sidebarWidth)
    },
    window: {
      bounds: normalizeBounds(window.bounds),
      maximized:
        typeof window.maximized === 'boolean' ? window.maximized : defaults.window.maximized,
      fullscreen:
        typeof window.fullscreen === 'boolean' ? window.fullscreen : defaults.window.fullscreen
    },
    tabs,
    activeTabId: repairActiveTabId(parsed.activeTabId, tabs),
    recents: normalizeRecents(parsed.recents),
    outlineCollapsedByPath: normalizeOutlineCollapsedByPath(parsed.outlineCollapsedByPath)
  }
}

function readWorkspaceFile(path: string): LegacyWorkspaceFile | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    return isObject(parsed) ? (parsed as LegacyWorkspaceFile) : null
  } catch {
    return null
  }
}

export class WorkspaceStore {
  private cache: WorkspaceState | null = null
  private pendingWrite: PendingWorkspaceWrite | null = null
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private writeInFlight: Promise<void> | null = null
  private writeVersion = 0

  constructor(
    private readonly path?: string,
    private readonly notesRootProvider: () => string = () => settingsStore.load().notesRoot
  ) {}

  private filePath(): string {
    return this.path ?? workspaceFilePath()
  }

  load(): WorkspaceState {
    if (this.cache) return this.cache
    const path = this.filePath()
    if (!existsSync(path)) {
      this.cache = defaultWorkspaceState()
      return this.cache
    }
    const parsed = readWorkspaceFile(path)
    if (!parsed) {
      this.cache = defaultWorkspaceState()
      this.persistSync(this.cache)
      return this.cache
    }
    const normalized = normalizeWorkspace(parsed)
    this.cache = normalized
    if (
      parsed.schemaVersion !== WORKSPACE_SCHEMA_VERSION ||
      JSON.stringify(parsed) !== JSON.stringify(normalized)
    ) {
      this.persistSync(this.cache)
    }
    return this.cache
  }

  publicState(): WorkspaceState {
    return this.load()
  }

  updateShell(patch: WorkspaceShellUpdate): WorkspaceState {
    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      shell: {
        ...current.shell,
        ...(patch.sidebarCollapsed !== undefined
          ? { sidebarCollapsed: patch.sidebarCollapsed }
          : {}),
        ...(patch.sidebarWidth !== undefined
          ? { sidebarWidth: normalizeSidebarWidth(patch.sidebarWidth) }
          : {})
      }
    }
    this.persist(next)
    return this.publicState()
  }

  updateWindow(patch: WorkspaceWindowUpdate): WorkspaceState {
    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      window: {
        ...current.window,
        ...(patch.bounds !== undefined ? { bounds: normalizeBounds(patch.bounds) } : {}),
        ...(patch.maximized !== undefined ? { maximized: patch.maximized } : {}),
        ...(patch.fullscreen !== undefined ? { fullscreen: patch.fullscreen } : {})
      }
    }
    this.persist(next)
    return this.publicState()
  }

  async openFile(input: WorkspaceOpenFileInput): Promise<WorkspaceState> {
    const sourcePath = requireSourcePath(input.sourcePath)
    await this.assertExistingSourceFile(sourcePath)

    const current = this.load()
    const tab: WorkspaceFileTab = {
      id: randomUUID(),
      sourcePath,
      title: titleFromSourcePath(sourcePath),
      viewMode: 'preview'
    }
    const next: WorkspaceState = {
      ...current,
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
      recents: recordRecentInState(current, sourcePath)
    }
    this.persist(next)
    return this.publicState()
  }

  focusTab(input: WorkspaceFocusTabInput): WorkspaceState {
    const tabId = requireTabId(input.tabId)
    const current = this.load()
    if (!current.tabs.some((tab) => tab.id === tabId)) throw new Error('Workspace tab not found')

    const next: WorkspaceState = {
      ...current,
      activeTabId: tabId
    }
    this.persist(next)
    return this.publicState()
  }

  closeTab(input: WorkspaceCloseTabInput): WorkspaceState {
    const tabId = requireTabId(input.tabId)
    const current = this.load()
    const closedIndex = current.tabs.findIndex((tab) => tab.id === tabId)
    if (closedIndex === -1) throw new Error('Workspace tab not found')

    const tabs = current.tabs.filter((tab) => tab.id !== tabId)
    const activeTabId =
      current.activeTabId === tabId
        ? (tabs[closedIndex]?.id ?? tabs[closedIndex - 1]?.id ?? null)
        : repairActiveTabId(current.activeTabId, tabs)

    const next: WorkspaceState = {
      ...current,
      tabs,
      activeTabId
    }
    this.persist(next)
    return this.publicState()
  }

  updateTabViewMode(input: WorkspaceUpdateTabViewModeInput): WorkspaceState {
    const tabId = requireTabId(input.tabId)
    if (!isWorkspaceViewMode(input.viewMode)) throw new Error('Invalid workspace tab view mode')
    const current = this.load()
    if (!current.tabs.some((tab) => tab.id === tabId)) throw new Error('Workspace tab not found')

    const next: WorkspaceState = {
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, viewMode: input.viewMode } : tab
      )
    }
    this.persist(next)
    return this.publicState()
  }

  async recordRecent(input: WorkspaceRecordRecentInput): Promise<WorkspaceState> {
    const sourcePath = requireSourcePath(input.sourcePath)
    await this.assertExistingSourceFile(sourcePath)

    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      recents: recordRecentInState(current, sourcePath)
    }
    this.persist(next)
    return this.publicState()
  }

  setOutlineCollapsed(input: WorkspaceSetOutlineCollapsedInput): WorkspaceState {
    const sourcePath = requireSourcePath(input.sourcePath)
    if (typeof input.collapsed !== 'boolean') throw new Error('Invalid workspace outline state')

    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      outlineCollapsedByPath: {
        ...current.outlineCollapsedByPath,
        [sourcePath]: input.collapsed
      }
    }
    this.persist(next)
    return this.publicState()
  }

  async pruneMissingFileRefs(): Promise<WorkspaceState> {
    const current = this.load()
    const existingPaths = await this.currentSourcePathSet()
    const tabs = current.tabs.filter((tab) => existingPaths.has(tab.sourcePath))
    const outlineCollapsedByPath: Record<string, boolean> = {}

    for (const [sourcePath, collapsed] of Object.entries(current.outlineCollapsedByPath)) {
      if (existingPaths.has(sourcePath)) outlineCollapsedByPath[sourcePath] = collapsed
    }

    const next: WorkspaceState = {
      ...current,
      tabs,
      activeTabId: repairActiveTabId(current.activeTabId, tabs),
      recents: current.recents.filter((recent) => existingPaths.has(recent.sourcePath)),
      outlineCollapsedByPath
    }
    this.persist(next)
    return this.publicState()
  }

  private persist(next: WorkspaceState): void {
    this.cache = next
    this.pendingWrite = {
      state: next,
      version: ++this.writeVersion
    }
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      void this.flush().catch((error: unknown) => {
        console.error('Failed to persist workspace state', error)
      })
    }, WORKSPACE_WRITE_DEBOUNCE_MS)
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }

    if (this.writeInFlight) {
      await this.writeInFlight
      if (!this.pendingWrite) return
    }

    const next = this.pendingWrite
    if (!next) return

    this.pendingWrite = null
    const write = this.writeAtomic(next.state, next.version)
    this.writeInFlight = write
    try {
      await write
    } finally {
      if (this.writeInFlight === write) {
        this.writeInFlight = null
      }
    }

    if (this.pendingWrite) {
      await this.flush()
    }
  }

  flushSync(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    if (!this.pendingWrite) return
    const next = this.pendingWrite
    if (!this.writeInFlight) {
      this.pendingWrite = null
    }
    this.persistSync(next.state)
  }

  private async writeAtomic(next: WorkspaceState, version: number): Promise<void> {
    const path = this.filePath()
    await mkdir(dirname(path), { recursive: true })
    const tempPath = this.tempFilePath(path)
    await writeFile(tempPath, JSON.stringify(next, null, 2), 'utf-8')
    if (version !== this.writeVersion) {
      await rm(tempPath, { force: true })
      return
    }
    await rename(tempPath, path)
  }

  private persistSync(next: WorkspaceState): void {
    const path = this.filePath()
    mkdirSync(dirname(path), { recursive: true })
    const tempPath = this.tempFilePath(path)
    writeFileSync(tempPath, JSON.stringify(next, null, 2), 'utf-8')
    renameSync(tempPath, path)
    rmSync(tempPath, { force: true })
    this.cache = next
  }

  private tempFilePath(path: string): string {
    return join(
      dirname(path),
      `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
    )
  }

  private async assertExistingSourceFile(sourcePath: string): Promise<void> {
    const root = await realpath(resolve(this.notesRootProvider()))
    let resolvedTarget: string
    try {
      resolvedTarget = await realpath(resolve(root, sourcePath))
    } catch {
      throw new Error(`Workspace file not found: ${sourcePath}`)
    }

    if (resolvedTarget !== root && !resolvedTarget.startsWith(root + sep)) {
      throw new Error('Workspace file outside notes root')
    }

    const fileStat = await stat(resolvedTarget)
    if (!fileStat.isFile()) throw new Error(`Workspace file not found: ${sourcePath}`)
  }

  private async currentSourcePathSet(): Promise<Set<string>> {
    const root = await realpath(resolve(this.notesRootProvider()))
    const absolutePaths = await walkNotes(root)
    const sourcePaths = absolutePaths
      .map((path) => normalizeSourcePath(relative(root, path)))
      .filter((path): path is string => !!path)
    return new Set(sourcePaths)
  }
}

export const workspaceStore = new WorkspaceStore()
