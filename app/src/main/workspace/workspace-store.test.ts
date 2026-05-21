import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH } from '../../shared/workspace'
import { WorkspaceStore, defaultWorkspaceState } from './workspace-store'

let tempDir: string

describe('WorkspaceStore', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-workspace-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function store(): WorkspaceStore {
    return new WorkspaceStore(join(tempDir, 'workspace.json'))
  }

  it('returns defaults when no file exists', () => {
    expect(store().publicState()).toEqual(defaultWorkspaceState())
  })

  it('persists shell state updates', () => {
    const workspace = store()
    workspace.updateShell({ sidebarCollapsed: true, sidebarWidth: 420 })
    workspace.flushSync()

    const state = store().publicState()
    expect(state.shell.sidebarCollapsed).toBe(true)
    expect(state.shell.sidebarWidth).toBe(420)
  })

  it('updates the in-memory shell state before debounced persistence flushes', () => {
    const workspace = store()
    const state = workspace.updateShell({ sidebarCollapsed: true, sidebarWidth: 420 })

    expect(state.shell.sidebarCollapsed).toBe(true)
    expect(state.shell.sidebarWidth).toBe(420)
    expect(workspace.publicState().shell.sidebarCollapsed).toBe(true)
    expect(readdirSync(tempDir)).toEqual([])

    workspace.flushSync()
    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toMatchObject({
      shell: {
        sidebarCollapsed: true,
        sidebarWidth: 420
      }
    })
  })

  it('clamps invalid sidebar widths to the minimum', () => {
    const workspace = store()
    const state = workspace.updateShell({ sidebarWidth: 12 })
    workspace.flushSync()
    expect(state.shell.sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('persists window state updates', () => {
    const workspace = store()
    workspace.updateWindow({
      bounds: { x: 100, y: 120, width: 1460, height: 980 },
      maximized: true,
      fullscreen: false
    })
    workspace.flushSync()

    const state = store().publicState()
    expect(state.window).toEqual({
      bounds: { x: 100, y: 120, width: 1460, height: 980 },
      maximized: true,
      fullscreen: false
    })
  })

  it('migrates malformed workspace files back to safe shell defaults', () => {
    writeFileSync(
      join(tempDir, 'workspace.json'),
      JSON.stringify({
        schemaVersion: 0,
        shell: {
          sidebarCollapsed: 'yes',
          sidebarWidth: 1
        },
        window: {
          bounds: { x: 'bad', y: 0, width: 100, height: 100 },
          maximized: 'no'
        }
      }),
      'utf-8'
    )

    const state = store().publicState()
    expect(state.shell).toEqual({
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_MIN_WIDTH
    })
    expect(state.window.bounds).toBeNull()
    expect(state.window.maximized).toBe(false)

    const saved = JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8')) as {
      schemaVersion: number
      shell: { sidebarWidth: number }
    }
    expect(saved.schemaVersion).toBe(1)
    expect(saved.shell.sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('recovers invalid workspace JSON to defaults', () => {
    writeFileSync(join(tempDir, 'workspace.json'), '{', 'utf-8')

    expect(store().publicState()).toEqual(defaultWorkspaceState())
    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toEqual(
      defaultWorkspaceState()
    )
  })

  it('keeps a sensible default sidebar width for fresh state', () => {
    expect(store().publicState().shell.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('flushes debounced writes asynchronously', async () => {
    const workspace = store()
    workspace.updateShell({ sidebarCollapsed: true })

    await workspace.flush()

    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toMatchObject({
      shell: {
        sidebarCollapsed: true
      }
    })
    expect(readdirSync(tempDir)).toEqual(['workspace.json'])
  })
})
