import { EventEmitter } from 'node:events'

import chokidar, { type FSWatcher } from 'chokidar'

import { indexerService } from './indexer-service'

const TREE_CHANGED_EVENT = 'tree-changed'
const CATALOG_CHANGED_EVENT = 'catalog-changed'

function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}

export class Watcher {
  private fsw: FSWatcher | null = null
  private readonly events = new EventEmitter()

  start(notesRoot: string): void {
    if (this.fsw) this.stop()
    this.fsw = chokidar.watch(notesRoot, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    this.fsw.on('add', (path) => {
      if (!isMarkdownFile(path)) return
      this.emitTreeChanged()
      this.emitCatalogChanged()
      void indexerService.notifyFileChanged(path)
    })
    this.fsw.on('change', (path) => {
      if (!isMarkdownFile(path)) return
      this.emitCatalogChanged()
      void indexerService.notifyFileChanged(path)
    })
    this.fsw.on('unlink', (path) => {
      if (!isMarkdownFile(path)) return
      this.emitTreeChanged()
      this.emitCatalogChanged()
      void indexerService.notifyFileRemoved(path)
    })
    this.fsw.on('addDir', () => {
      this.emitTreeChanged()
    })
    this.fsw.on('unlinkDir', () => {
      this.emitTreeChanged()
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

  onCatalogChanged(cb: () => void): () => void {
    this.events.on(CATALOG_CHANGED_EVENT, cb)
    return () => this.events.off(CATALOG_CHANGED_EVENT, cb)
  }

  private emitTreeChanged(): void {
    this.events.emit(TREE_CHANGED_EVENT)
  }

  private emitCatalogChanged(): void {
    this.events.emit(CATALOG_CHANGED_EVENT)
  }
}

export const watcher = new Watcher()
