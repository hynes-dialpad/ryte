import { contextBridge, ipcRenderer } from 'electron'

import type { PublicSettingsState, SettingsUpdate } from '../main/settings/settings-store'

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

export interface RyteApi {
  settings: {
    getState(): Promise<PublicSettingsState>
    save(patch: SettingsUpdate): Promise<PublicSettingsState>
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
  }
}

const api: RyteApi = {
  settings: {
    getState: () => ipcRenderer.invoke('settings:get-state'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch)
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
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('ryte', api)
  } catch (error) {
    console.error('Failed to expose ryte api:', error)
  }
} else {
  // @ts-ignore — fallback when context isolation is off (dev only)
  window.ryte = api
}
