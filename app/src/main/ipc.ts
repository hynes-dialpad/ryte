import { BrowserWindow, dialog, ipcMain } from 'electron'

import { indexerService } from './indexing/indexer-service'
import { watcher } from './indexing/watcher'
import { settingsStore, type SettingsUpdate } from './settings/settings-store'

/**
 * Register all IPC handlers. Call once during app.whenReady() after
 * indexer-service is initialized.
 */
export function registerIpc(): void {
  ipcMain.handle('settings:get-state', () => settingsStore.publicState())

  ipcMain.handle('settings:save', async (_, patch: SettingsUpdate) => {
    const next = settingsStore.update(patch)
    // Re-init indexer and restart watcher so new notesRoot / keys take effect.
    indexerService.close()
    const ready = indexerService.init()
    await watcher.stop()
    if (ready) {
      watcher.start(settingsStore.load().notesRoot)
    }
    return next
  })

  ipcMain.handle('dialog:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('indexer:get-status', () => indexerService.getStatus())

  ipcMain.handle('indexer:trigger-reindex', () => {
    // Fire-and-forget. Renderer subscribes via indexer:status-event for progress.
    void indexerService.triggerReindex()
  })

  // Push status events to all renderer windows.
  indexerService.subscribe((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('indexer:status-event', status)
    }
  })
}
