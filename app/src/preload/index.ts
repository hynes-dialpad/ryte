import { contextBridge, ipcRenderer } from 'electron'

import type { PublicSettingsState, SettingsUpdate } from '../main/settings/settings-store'
import type { ProviderKeyValidationResult } from '../main/settings/key-validation'
import type { ProviderId } from '../shared/provider-registry'

export interface IndexerStatus {
  phase: 'idle' | 'walking' | 'indexing' | 'done' | 'error'
  filesTotal: number
  filesDone: number
  chunksTotal: number
  chunksDone: number
  error?: string
}

export interface FileTreeResponse {
  notesRoot: string
  paths: string[]
}

export interface SearchSource {
  sourcePath: string
  headingPath: string[]
}

export interface SearchCitation {
  index: number
  sourcePath: string
  headingPath: string[]
}

export interface SearchNotice {
  code:
    | 'no-local-sources'
    | 'cloud-answers-disabled'
    | 'cloud-answers-not-acknowledged'
    | 'provider-key-missing'
  message: string
}

export interface RyteApi {
  app: {
    getVersion(): Promise<string>
  }
  settings: {
    getState(): Promise<PublicSettingsState>
    save(patch: SettingsUpdate): Promise<PublicSettingsState>
    validateKey(provider: ProviderId): Promise<ProviderKeyValidationResult>
  }
  dialog: {
    openFolder(): Promise<string | null>
  }
  indexer: {
    triggerReindex(): Promise<void>
    getStatus(): Promise<IndexerStatus>
    onStatus(cb: (status: IndexerStatus) => void): () => void
  }
  files: {
    listTree(): Promise<FileTreeResponse>
    read(absPath: string): Promise<string>
    watch(absPath: string): Promise<void>
    unwatch(): Promise<void>
    onChange(cb: (path: string) => void): () => void
    onTreeChanged(cb: () => void): () => void
  }
  search: {
    query(q: string): Promise<string | null>
    cancel(requestId: string): Promise<void>
    onToken(cb: (requestId: string, token: string) => void): () => void
    onSources(cb: (requestId: string, sources: SearchSource[]) => void): () => void
    onCitation(cb: (requestId: string, citation: SearchCitation) => void): () => void
    onNotice(cb: (requestId: string, notice: SearchNotice) => void): () => void
    onDone(cb: (requestId: string) => void): () => void
    onError(cb: (requestId: string, error: string) => void): () => void
  }
}

const api: RyteApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version')
  },
  settings: {
    getState: () => ipcRenderer.invoke('settings:get-state'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
    validateKey: (provider) => ipcRenderer.invoke('settings:validate-key', provider)
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:open-folder')
  },
  indexer: {
    triggerReindex: () => ipcRenderer.invoke('indexer:trigger-reindex'),
    getStatus: () => ipcRenderer.invoke('indexer:get-status'),
    onStatus: (cb) => {
      const listener = (_: unknown, status: IndexerStatus): void => cb(status)
      ipcRenderer.on('indexer:status-event', listener)
      return () => ipcRenderer.removeListener('indexer:status-event', listener)
    }
  },
  files: {
    listTree: () => ipcRenderer.invoke('files:list-tree'),
    read: (absPath) => ipcRenderer.invoke('files:read', absPath),
    watch: (absPath) => ipcRenderer.invoke('files:watch', absPath),
    unwatch: () => ipcRenderer.invoke('files:unwatch'),
    onChange: (cb) => {
      const listener = (_: unknown, path: string): void => cb(path)
      ipcRenderer.on('viewer:file-changed', listener)
      return () => ipcRenderer.removeListener('viewer:file-changed', listener)
    },
    onTreeChanged: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on('files:tree-changed', listener)
      return () => ipcRenderer.removeListener('files:tree-changed', listener)
    }
  },
  search: {
    query: (q) => ipcRenderer.invoke('search:query', q),
    cancel: (requestId) => ipcRenderer.invoke('search:cancel', requestId),
    onToken: (cb) => {
      const listener = (_: unknown, payload: { requestId: string; token: string }): void =>
        cb(payload.requestId, payload.token)
      ipcRenderer.on('search:stream-token', listener)
      return () => ipcRenderer.removeListener('search:stream-token', listener)
    },
    onSources: (cb) => {
      const listener = (
        _: unknown,
        payload: { requestId: string; sources: SearchSource[] }
      ): void => cb(payload.requestId, payload.sources)
      ipcRenderer.on('search:sources', listener)
      return () => ipcRenderer.removeListener('search:sources', listener)
    },
    onCitation: (cb) => {
      const listener = (_: unknown, payload: SearchCitation & { requestId: string }): void =>
        cb(payload.requestId, {
          index: payload.index,
          sourcePath: payload.sourcePath,
          headingPath: payload.headingPath
        })
      ipcRenderer.on('search:citation', listener)
      return () => ipcRenderer.removeListener('search:citation', listener)
    },
    onNotice: (cb) => {
      const listener = (_: unknown, payload: { requestId: string; notice: SearchNotice }): void =>
        cb(payload.requestId, payload.notice)
      ipcRenderer.on('search:notice', listener)
      return () => ipcRenderer.removeListener('search:notice', listener)
    },
    onDone: (cb) => {
      const listener = (_: unknown, payload: { requestId: string }): void => cb(payload.requestId)
      ipcRenderer.on('search:done', listener)
      return () => ipcRenderer.removeListener('search:done', listener)
    },
    onError: (cb) => {
      const listener = (_: unknown, payload: { requestId: string; error: string }): void =>
        cb(payload.requestId, payload.error)
      ipcRenderer.on('search:error', listener)
      return () => ipcRenderer.removeListener('search:error', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('ryte', api)
  } catch (error) {
    console.error('Failed to expose ryte api:', error)
  }
}
