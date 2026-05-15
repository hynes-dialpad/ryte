import chokidar, { type FSWatcher } from 'chokidar'

import { indexerService } from './indexer-service'

export class Watcher {
  private fsw: FSWatcher | null = null

  start(notesRoot: string): void {
    if (this.fsw) this.stop()
    this.fsw = chokidar.watch(`${notesRoot}/**/*.md`, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    this.fsw.on('add', (path) => indexerService.notifyFileChanged(path))
    this.fsw.on('change', (path) => indexerService.notifyFileChanged(path))
    this.fsw.on('unlink', (path) => indexerService.notifyFileRemoved(path))
  }

  async stop(): Promise<void> {
    await this.fsw?.close()
    this.fsw = null
  }
}

export const watcher = new Watcher()
