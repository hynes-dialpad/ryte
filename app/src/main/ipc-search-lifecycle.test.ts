import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as Array<{ webContents: { send: ReturnType<typeof vi.fn> } }>,
  search: vi.fn(),
  cancel: vi.fn(),
  close: vi.fn(),
  init: vi.fn(),
  watcherStop: vi.fn(),
  watcherStart: vi.fn(),
  catalogChanged: undefined as
    | ((event: { type: 'upsert' | 'remove'; path: string; notesRoot: string }) => void)
    | undefined,
  catalogEntry: vi.fn(),
  settings: {
    notesRoot: '/notes',
    semanticIndexEnabled: false,
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small'
  }
}))

vi.mock('electron', () => ({
  app: { getVersion: vi.fn() },
  BrowserWindow: { getAllWindows: () => mocks.windows, fromWebContents: vi.fn() },
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    }
  },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() }
}))

vi.mock('./app-menu', () => ({ refreshAppMenu: vi.fn() }))
vi.mock('./facts/task-facts-service', () => ({ taskFactsService: { markStale: vi.fn() } }))
vi.mock('./indexing/indexer-service', () => ({
  indexerService: {
    close: mocks.close,
    getVectorStore: () => ({}),
    init: mocks.init,
    subscribe: vi.fn()
  }
}))
vi.mock('./indexing/walker', () => ({ walkNotes: vi.fn() }))
vi.mock('./indexing/watcher', () => ({
  watcher: {
    onCatalogChanged: vi.fn((callback) => {
      mocks.catalogChanged = callback
    }),
    onTreeChanged: vi.fn(),
    start: mocks.watcherStart,
    stop: mocks.watcherStop
  }
}))
vi.mock('./search/search-service', () => ({
  SearchService: vi.fn().mockImplementation(() => ({
    cancel: mocks.cancel,
    search: mocks.search
  }))
}))
vi.mock('./settings/settings-store', () => ({
  settingsStore: {
    getSecret: vi.fn(),
    load: () => ({ ...mocks.settings }),
    publicState: vi.fn(),
    update: (patch: { semanticIndexEnabled?: boolean }) => {
      if (patch.semanticIndexEnabled !== undefined) {
        mocks.settings.semanticIndexEnabled = patch.semanticIndexEnabled
      }
      return mocks.settings
    }
  }
}))
vi.mock('./settings/key-validation', () => ({ validateProviderKey: vi.fn() }))
vi.mock('./viewer/file-reader', () => ({
  readFileSafe: vi.fn(),
  readSourceFileSafe: vi.fn(),
  readSourceTitleSafe: vi.fn(),
  resolveSourcePathUnderRoot: vi.fn()
}))
vi.mock('./viewer/file-catalog', () => ({
  listFileCatalog: vi.fn(),
  fileCatalogEntryFor: mocks.catalogEntry
}))
vi.mock('./viewer/source-change-path', () => ({ sourcePathForViewerChange: vi.fn() }))
vi.mock('./viewer/viewer-watcher', () => ({ viewerWatcher: { onChange: vi.fn(), stop: vi.fn() } }))
vi.mock('./workspace/workspace-store', () => ({ workspaceStore: {} }))

interface TestWebContents {
  destroyed: () => void
  isDestroyed: () => boolean
  removeListener: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
}

function makeWebContents(): TestWebContents {
  let onDestroyed: (() => void) | undefined
  let isDestroyed = false
  return {
    destroyed: () => {
      isDestroyed = true
      onDestroyed?.()
    },
    isDestroyed: () => isDestroyed,
    removeListener: vi.fn((_event: string, listener: () => void) => {
      if (onDestroyed === listener) onDestroyed = undefined
    }),
    send: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      if (event === 'destroyed') onDestroyed = listener
    })
  }
}

function handler(channel: string): (...args: unknown[]) => unknown {
  const registered = mocks.handlers.get(channel)
  if (!registered) throw new Error(`IPC handler was not registered: ${channel}`)
  return registered
}

describe('search IPC request lifecycle', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    mocks.handlers.clear()
    mocks.windows = []
    mocks.search.mockReset().mockImplementation(() => new Promise<void>(() => undefined))
    mocks.cancel.mockReset()
    mocks.close.mockReset()
    mocks.init.mockReset().mockReturnValue(true)
    mocks.watcherStop.mockReset().mockResolvedValue(undefined)
    mocks.watcherStart.mockReset()
    mocks.catalogChanged = undefined
    mocks.catalogEntry.mockReset()
    mocks.settings = {
      notesRoot: '/notes',
      semanticIndexEnabled: false,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small'
    }

    const { registerIpc } = await import('./ipc')
    registerIpc()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends stream callbacks only to the webContents that started the request', async () => {
    const requester = makeWebContents()
    const otherWindow = makeWebContents()
    mocks.windows = [{ webContents: requester }, { webContents: otherWindow }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    const callbacks = mocks.search.mock.calls[0]?.[2] as { onToken(token: string): void }

    callbacks.onToken('A streamed token')

    expect(requester.send).toHaveBeenCalledWith('search:stream-token', {
      requestId,
      token: 'A streamed token'
    })
    expect(otherWindow.send).not.toHaveBeenCalled()
  })

  it('cancels a request when its requesting webContents is destroyed', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    const callbacks = mocks.search.mock.calls[0]?.[2] as { onToken(token: string): void }
    requester.destroyed()

    expect(mocks.cancel).toHaveBeenCalledWith(requestId)
    callbacks.onToken('late token')
    expect(requester.send).not.toHaveBeenCalled()
  })

  it('only accepts cancellation from the webContents that started the request', async () => {
    const requester = makeWebContents()
    const otherWindow = makeWebContents()
    mocks.windows = [{ webContents: requester }, { webContents: otherWindow }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    handler('search:cancel')({ sender: otherWindow }, requestId)

    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('cancels active requests before replacing the search service for indexer settings', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    await handler('settings:save')({ sender: requester }, { semanticIndexEnabled: true })

    expect(mocks.cancel).toHaveBeenCalledWith(requestId)
  })

  it('test_catalog_change_sends_one_typed_file_patch_to_each_window', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]
    mocks.catalogEntry.mockResolvedValue({ sourcePath: 'plans/a.md', title: 'A' })

    mocks.catalogChanged?.({ type: 'upsert', path: '/notes/plans/a.md', notesRoot: '/notes' })
    await Promise.resolve()
    await Promise.resolve()

    expect(requester.send).toHaveBeenCalledWith('files:catalog-changed', {
      type: 'upsert',
      file: { sourcePath: 'plans/a.md', title: 'A' }
    })
  })

  it('drops catalog events from a watcher that belongs to a previous notes root', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]
    mocks.settings.notesRoot = '/new-notes'

    mocks.catalogChanged?.({
      type: 'remove',
      path: '/notes/plans/a.md',
      notesRoot: '/notes'
    })
    await Promise.resolve()

    expect(requester.send).not.toHaveBeenCalledWith('files:catalog-changed', expect.anything())
  })
})
