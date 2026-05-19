import { EventEmitter } from 'node:events'

import chokidar, { type FSWatcher } from 'chokidar'

import { indexerService } from './indexer-service'

const TREE_CHANGED_EVENT = 'tree-changed'

export class Watcher {
  private fsw: FSWatcher | null = null
  private readonly events = new EventEmitter()

  start(notesRoot: string): void {
    if (this.fsw) this.stop()
    this.fsw = chokidar.watch(`${notesRoot}/**/*.md`, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    this.fsw.on('add', (path) => {
      this.emitTreeChanged()
      void indexerService.notifyFileChanged(path)
    })
    this.fsw.on('change', (path) => indexerService.notifyFileChanged(path))
    this.fsw.on('unlink', (path) => {
      this.emitTreeChanged()
      void indexerService.notifyFileRemoved(path)
    })
  }

  async stop(): Promise<void> {
    await this.fsw?.close()
    this.fsw = null
  }

  onTreeChanged(cb: () => void): () => void {
    this.events.on(TREE_CHANGED_EVENT, cb)
    return () => this.events.off(TREE_CHANGED_EVENT, cb)
  }

  private emitTreeChanged(): void {
    this.events.emit(TREE_CHANGED_EVENT)
  }
}

export const watcher = new Watcher()
