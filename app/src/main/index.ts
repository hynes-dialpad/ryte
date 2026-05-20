import { app, BrowserWindow, Notification, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import icon from '../../resources/icon.png?asset'

import { indexerService } from './indexing/indexer-service'
import { watcher } from './indexing/watcher'
import { registerIpc } from './ipc'
import { installNavigationGuards, originForUrl } from './navigation'
import { settingsStore } from './settings/settings-store'
import { workspaceStore } from './workspace/workspace-store'
import { safeWindowBounds, workAreasFromDisplays } from './window-state'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from '../shared/workspace'

// Set early so macOS notifications show "ryte" as the source instead of
// "Electron" (only relevant in dev — packaged builds use CFBundleName).
app.setName('ryte')

function createWindow(): void {
  const rendererUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const rendererOrigin = rendererUrl ? originForUrl(rendererUrl) : null
  const allowedAppOrigins = new Set(rendererOrigin ? [rendererOrigin] : [])
  const workspace = workspaceStore.publicState()
  const bounds = safeWindowBounds(
    workspace.window.bounds,
    workAreasFromDisplays(screen.getAllDisplays())
  )

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    title: 'ryte',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 20, y: 22 },
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const
        }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  installWindowStatePersistence(mainWindow)

  mainWindow.on('ready-to-show', () => {
    const state = workspaceStore.publicState().window
    if (state.maximized) mainWindow.maximize()
    if (state.fullscreen) mainWindow.setFullScreen(true)
    mainWindow.show()
  })

  installNavigationGuards(mainWindow, allowedAppOrigins)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function installWindowStatePersistence(window: BrowserWindow): void {
  let pending: ReturnType<typeof setTimeout> | null = null

  const persistNow = (): void => {
    if (pending) clearTimeout(pending)
    workspaceStore.updateWindow({
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen()
    })
    pending = null
  }

  const persist = (): void => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(persistNow, 250)
  }

  window.on('resized', persist)
  window.on('moved', persist)
  window.on('maximize', persist)
  window.on('unmaximize', persist)
  window.on('enter-full-screen', persist)
  window.on('leave-full-screen', persist)
  window.on('close', persistNow)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.joshuahynes.ryte')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const ready = indexerService.init()
  registerIpc()
  if (ready) {
    watcher.start(settingsStore.load().notesRoot)
  }

  let lastNotifiedPhase: string | null = null
  indexerService.subscribe((status) => {
    if (status.phase === 'done' && lastNotifiedPhase === 'indexing') {
      if (Notification.isSupported()) {
        new Notification({
          title: 'ryte',
          body: `Index ready: ${status.chunksTotal} chunks across ${status.filesTotal} files`
        }).show()
      }
    }
    lastNotifiedPhase = status.phase
  })

  createWindow()
  if (ready) {
    void indexerService.triggerReindex()
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
