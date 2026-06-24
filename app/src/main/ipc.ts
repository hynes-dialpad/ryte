import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

import { app, BrowserWindow, dialog, ipcMain } from 'electron'

import { refreshAppMenu } from './app-menu'
import { indexerService } from './indexing/indexer-service'
import { walkNotes } from './indexing/walker'
import { watcher } from './indexing/watcher'
import {
  assertValidAbsolutePath,
  assertValidProviderId,
  assertValidRequestId,
  assertValidSearchOptions,
  assertValidSearchQuery,
  assertValidSourceFileInput,
  assertValidSettingsPatch,
  assertValidWorkspaceCloseTabInput,
  assertValidWorkspaceFocusTabInput,
  assertValidWorkspaceOpenFileInput,
  assertValidWorkspaceRecordRecentInput,
  assertValidWorkspaceSetOutlineCollapsedInput,
  assertValidWorkspaceShellPatch,
  assertValidWorkspaceUpdateTabViewModeInput,
  assertValidWorkspaceWindowPatch
} from './ipc-validation'
import { SearchService } from './search/search-service'
import { settingsStore, type SettingsFile, type SettingsUpdate } from './settings/settings-store'
import { validateProviderKey } from './settings/key-validation'
import {
  readFileSafe,
  readSourceFileSafe,
  readSourceTitleSafe,
  resolveAndAssertUnderRoot,
  resolveSourcePathUnderRoot
} from './viewer/file-reader'
import { listFileCatalog } from './viewer/file-catalog'
import { sourcePathForViewerChange } from './viewer/source-change-path'
import { viewerWatcher } from './viewer/viewer-watcher'
import { workspaceStore } from './workspace/workspace-store'

let searchService: SearchService | null = null
let watchedViewerSourcePath: string | null = null

async function sourcePathForPickedMarkdownFile(
  absPath: string,
  notesRoot: string
): Promise<string> {
  const safePath = await resolveAndAssertUnderRoot(absPath, notesRoot)
  if (extname(safePath).toLowerCase() !== '.md') {
    throw new Error('Selected file must be a Markdown file')
  }

  const resolvedRoot = await realpath(resolve(notesRoot))
  return relative(resolvedRoot, safePath)
}

function settingsPatchRequiresIndexerRestart(
  patch: SettingsUpdate,
  before: SettingsFile,
  after: SettingsFile
): boolean {
  return (
    before.notesRoot !== after.notesRoot ||
    patch.openaiKey !== undefined ||
    patch.deleteProviderKeys?.includes('openai') === true ||
    before.semanticIndexEnabled !== after.semanticIndexEnabled ||
    before.embeddingProvider !== after.embeddingProvider ||
    before.embeddingModel !== after.embeddingModel
  )
}

function getOrCreateSearchService(): SearchService | null {
  const vs = indexerService.getVectorStore()
  if (!vs) return null
  if (!searchService) {
    searchService = new SearchService(indexerService, vs, settingsStore)
  }
  return searchService
}

/**
 * Register all IPC handlers. Call once during app.whenReady() after
 * indexer-service is initialized.
 */
export function registerIpc(): void {
  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('settings:get-state', () => settingsStore.publicState())

  ipcMain.handle('workspace:get-state', () => workspaceStore.publicState())

  ipcMain.handle('workspace:update-shell', (_event, patch: unknown) => {
    return workspaceStore.updateShell(assertValidWorkspaceShellPatch(patch))
  })

  ipcMain.handle('workspace:update-window', (_event, patch: unknown) => {
    return workspaceStore.updateWindow(assertValidWorkspaceWindowPatch(patch))
  })

  ipcMain.handle('workspace:open-file', (_event, input: unknown) => {
    const next = workspaceStore.openFile(assertValidWorkspaceOpenFileInput(input))
    refreshAppMenu()
    return next
  })

  ipcMain.handle('workspace:focus-tab', (_event, input: unknown) => {
    return workspaceStore.focusTab(assertValidWorkspaceFocusTabInput(input))
  })

  ipcMain.handle('workspace:close-tab', (_event, input: unknown) => {
    return workspaceStore.closeTab(assertValidWorkspaceCloseTabInput(input))
  })

  ipcMain.handle('workspace:update-tab-view-mode', (_event, input: unknown) => {
    return workspaceStore.updateTabViewMode(assertValidWorkspaceUpdateTabViewModeInput(input))
  })

  ipcMain.handle('workspace:record-recent', (_event, input: unknown) => {
    const next = workspaceStore.recordRecent(assertValidWorkspaceRecordRecentInput(input))
    refreshAppMenu()
    return next
  })

  ipcMain.handle('workspace:set-outline-collapsed', (_event, input: unknown) => {
    return workspaceStore.setOutlineCollapsed(assertValidWorkspaceSetOutlineCollapsedInput(input))
  })

  ipcMain.handle('workspace:prune-missing-file-refs', () => {
    const next = workspaceStore.pruneMissingFileRefs()
    refreshAppMenu()
    return next
  })

  ipcMain.handle('settings:save', async (_, patch: unknown) => {
    const validatedPatch = assertValidSettingsPatch(patch)
    const previousSettings = settingsStore.load()
    const next = settingsStore.update(validatedPatch)
    if (
      settingsPatchRequiresIndexerRestart(validatedPatch, previousSettings, settingsStore.load())
    ) {
      // Re-init indexer and restart watcher so new notesRoot / embedding settings take effect.
      indexerService.close()
      searchService = null // vectorStore is replaced; recreate on next search
      const ready = indexerService.init()
      await watcher.stop()
      if (ready) {
        watcher.start(settingsStore.load().notesRoot)
      }
    }
    return next
  })

  ipcMain.handle('settings:validate-key', async (_, provider: unknown) => {
    const validProvider = assertValidProviderId(provider)
    const apiKey = settingsStore.getSecret(validProvider)
    if (!apiKey) {
      return {
        ok: false,
        provider: validProvider,
        validatedAt: null,
        error: 'No saved API key to validate.'
      }
    }
    const result = await validateProviderKey(validProvider, apiKey)
    if (result.ok && result.validatedAt) {
      settingsStore.markKeyValidated(validProvider, result.validatedAt)
    }
    return result
  })

  ipcMain.handle('dialog:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:open-file', async (event) => {
    const notesRoot = settingsStore.load().notesRoot
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          defaultPath: notesRoot,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          defaultPath: notesRoot,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          properties: ['openFile']
        })
    if (result.canceled || result.filePaths.length === 0) return null

    const sourcePath = await sourcePathForPickedMarkdownFile(result.filePaths[0]!, notesRoot)
    return { sourcePath }
  })

  ipcMain.handle('indexer:get-status', () => indexerService.getStatus())

  ipcMain.handle('indexer:trigger-reindex', () => {
    // Fire-and-forget. Renderer subscribes via indexer:status-event for progress.
    void indexerService.triggerReindex()
  })

  ipcMain.handle('indexer:clear-and-rebuild', async () => {
    searchService = null
    await indexerService.clearAndRebuild()
  })

  // Push status events to all renderer windows.
  indexerService.subscribe((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('indexer:status-event', status)
    }
  })

  ipcMain.handle('files:list-tree', async () => {
    const notesRoot = settingsStore.load().notesRoot
    const absolutePaths = await walkNotes(notesRoot)
    const paths = absolutePaths.map((p) => relative(notesRoot, p)).sort()
    return { notesRoot, paths }
  })

  ipcMain.handle('files:list-catalog', async () => {
    const notesRoot = settingsStore.load().notesRoot
    return listFileCatalog(notesRoot)
  })

  ipcMain.handle('files:read', async (_event, absPath: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    return readFileSafe(assertValidAbsolutePath(absPath), notesRoot)
  })

  ipcMain.handle('files:read-source', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { sourcePath } = assertValidSourceFileInput(input)
    return readSourceFileSafe(sourcePath, notesRoot)
  })

  ipcMain.handle('files:read-source-title', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { sourcePath } = assertValidSourceFileInput(input)
    return readSourceTitleSafe(sourcePath, notesRoot)
  })

  ipcMain.handle('files:watch', async (_event, absPath: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const safePath = await resolveAndAssertUnderRoot(assertValidAbsolutePath(absPath), notesRoot)
    watchedViewerSourcePath = null
    await viewerWatcher.watch(safePath)
  })

  ipcMain.handle('files:watch-source', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { sourcePath } = assertValidSourceFileInput(input)
    const safePath = await resolveSourcePathUnderRoot(sourcePath, notesRoot)
    watchedViewerSourcePath = null
    await viewerWatcher.watch(safePath)
    watchedViewerSourcePath = sourcePath
  })

  ipcMain.handle('files:unwatch', async () => {
    watchedViewerSourcePath = null
    await viewerWatcher.stop()
  })

  // Push viewer-watcher change events to all renderer windows.
  viewerWatcher.onChange((path) => {
    const notesRoot = settingsStore.load().notesRoot
    const sourcePath = sourcePathForViewerChange(path, notesRoot, watchedViewerSourcePath)
    if (sourcePath) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('viewer:source-changed', sourcePath)
      }
    }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('viewer:file-changed', path)
    }
  })

  watcher.onTreeChanged(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('files:tree-changed')
    }
  })

  watcher.onCatalogChanged(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('files:catalog-changed')
    }
  })

  function broadcast(channel: string, payload: Record<string, unknown>): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('search:query', (_, rawQuery: unknown, rawOptions: unknown) => {
    const query = assertValidSearchQuery(rawQuery)
    const options = assertValidSearchOptions(rawOptions)
    const svc = getOrCreateSearchService()
    if (!svc) {
      broadcast('search:error', { requestId: '', error: 'Indexer not initialized' })
      return null
    }
    const requestId = randomUUID()
    setImmediate(() => {
      void svc.search(
        query,
        requestId,
        {
          onToken: (token) => broadcast('search:stream-token', { requestId, token }),
          onSources: (sources) => broadcast('search:sources', { requestId, sources }),
          onCitation: (citation) => broadcast('search:citation', { requestId, ...citation }),
          onNotice: (notice) => broadcast('search:notice', { requestId, notice }),
          onDone: () => broadcast('search:done', { requestId }),
          onError: (error) => broadcast('search:error', { requestId, error })
        },
        options
      )
    })
    return requestId
  })

  ipcMain.handle('search:cancel', (_, requestId: unknown) => {
    const svc = getOrCreateSearchService()
    svc?.cancel(assertValidRequestId(requestId))
  })
}
