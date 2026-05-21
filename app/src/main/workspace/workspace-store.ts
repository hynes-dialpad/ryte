import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { workspaceFilePath } from '../paths'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  WORKSPACE_SCHEMA_VERSION,
  type WindowBounds,
  type WorkspaceShellState,
  type WorkspaceShellUpdate,
  type WorkspaceState,
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

function normalizeWorkspace(parsed: LegacyWorkspaceFile): WorkspaceState {
  const defaults = defaultWorkspaceState()
  const shell: Partial<WorkspaceShellState> = isObject(parsed.shell) ? parsed.shell : {}
  const window: Partial<WorkspaceWindowState> = isObject(parsed.window) ? parsed.window : {}

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
    }
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

  constructor(private readonly path?: string) {}

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
    this.cache = normalizeWorkspace(parsed)
    if (parsed.schemaVersion !== WORKSPACE_SCHEMA_VERSION) this.persistSync(this.cache)
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
}

export const workspaceStore = new WorkspaceStore()
