import { EventEmitter } from 'node:events'
import { rmSync } from 'node:fs'

import { Indexer, type IndexerProgress } from './indexer'
import { IndexStateStore } from './index-state'
import { OpenAIEmbeddingProvider } from './embedder'
import { VectorStore } from './vector-store'
import { settingsStore } from '../settings/settings-store'
import { indexDbPath } from '../paths'

const STATUS_EVENT = 'status'

export function isRecoverableIndexStoreError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('database disk image is malformed') ||
    message.includes('file is not a database')
  )
}

function removeIndexDatabaseFiles(dbPath: string): void {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    rmSync(path, { force: true })
  }
}

export class IndexerService extends EventEmitter {
  private vectorStore: VectorStore | null = null
  private indexState: IndexStateStore | null = null
  private indexer: Indexer | null = null
  private embedder: OpenAIEmbeddingProvider | null = null
  private lastStatus: IndexerProgress = {
    phase: 'idle',
    filesTotal: 0,
    filesDone: 0,
    chunksTotal: 0,
    chunksDone: 0,
    lastIndexedAt: null
  }
  private running = false

  /**
   * Initialize the indexer using current settings. Keyword indexing is always
   * available; OpenAI embeddings are enabled only when a key is configured.
   */
  init(): boolean {
    const settings = settingsStore.load()
    const openaiKey = settings.semanticIndexEnabled ? settingsStore.getSecret('openai') : null
    const embedder = openaiKey
      ? new OpenAIEmbeddingProvider(openaiKey, { model: settings.embeddingModel })
      : null
    const dbPath = indexDbPath()

    try {
      this.initializeStores(dbPath, settings.notesRoot, embedder)
    } catch (error) {
      this.close()
      if (!isRecoverableIndexStoreError(error)) throw error
      removeIndexDatabaseFiles(dbPath)
      this.initializeStores(dbPath, settings.notesRoot, embedder)
    }

    return true
  }

  private initializeStores(
    dbPath: string,
    notesRoot: string,
    embedder: OpenAIEmbeddingProvider | null
  ): void {
    this.embedder = embedder
    this.vectorStore = new VectorStore(dbPath)
    this.vectorStore.init(embedder?.dim ?? 1536)
    this.indexState = new IndexStateStore(this.vectorStore.database)
    this.indexState.init()
    this.indexer = new Indexer({
      notesRoot,
      embedder,
      vectorStore: this.vectorStore,
      indexState: this.indexState
    })

    // Hydrate lastStatus with current totals.
    const totals = this.indexState.totals()
    this.lastStatus = {
      phase: totals.files > 0 ? 'done' : 'idle',
      filesTotal: totals.files,
      filesDone: totals.files,
      chunksTotal: totals.chunks,
      chunksDone: totals.chunks,
      lastIndexedAt: null
    }
  }

  getStatus(): IndexerProgress {
    return this.lastStatus
  }

  async triggerReindex(): Promise<void> {
    if (this.running) return
    if (!this.indexer) {
      const ok = this.init()
      if (!ok) return
    }
    this.running = true
    try {
      await this.indexAll()
    } catch (err) {
      if (this.recoverIndexStore(err)) {
        try {
          await this.indexAll()
        } catch (retryErr) {
          this.broadcastIndexingError(retryErr)
        }
      } else {
        this.broadcastIndexingError(err)
      }
    } finally {
      this.running = false
    }
  }

  async clearAndRebuild(): Promise<void> {
    if (this.running) throw new Error('Index rebuild already running')
    this.running = true
    try {
      this.broadcast({
        phase: 'walking',
        filesTotal: 0,
        filesDone: 0,
        chunksTotal: 0,
        chunksDone: 0
      })
      const dbPath = indexDbPath()
      this.close()
      removeIndexDatabaseFiles(dbPath)
      this.init()
      await this.indexAll()
    } catch (err) {
      this.broadcastIndexingError(err)
      throw err
    } finally {
      this.running = false
    }
  }

  async notifyFileChanged(absPath: string): Promise<void> {
    if (!this.indexer) return
    const r = await this.indexer.indexFile(absPath)
    if (r.skipped) return
    const totals = this.indexState!.totals()
    this.broadcast({
      phase: 'done',
      filesTotal: totals.files,
      filesDone: totals.files,
      chunksTotal: totals.chunks,
      chunksDone: totals.chunks
    })
  }

  async notifyFileRemoved(absPath: string): Promise<void> {
    if (!this.indexer) return
    await this.indexer.removeFile(absPath)
    const totals = this.indexState!.totals()
    this.broadcast({
      phase: 'done',
      filesTotal: totals.files,
      filesDone: totals.files,
      chunksTotal: totals.chunks,
      chunksDone: totals.chunks
    })
  }

  subscribe(cb: (status: IndexerProgress) => void): () => void {
    this.on(STATUS_EVENT, cb)
    cb(this.lastStatus)
    return () => this.off(STATUS_EVENT, cb)
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (!this.embedder) throw new Error('No embedding provider configured')
    return this.embedder.embed(texts)
  }

  getVectorStore(): VectorStore | null {
    return this.vectorStore
  }

  close(): void {
    this.vectorStore?.close()
    this.vectorStore = null
    this.indexState = null
    this.indexer = null
    this.embedder = null
  }

  private broadcast(p: IndexerProgress): void {
    const lastIndexedAt =
      p.phase === 'done'
        ? new Date().toISOString()
        : (p.lastIndexedAt ?? this.lastStatus.lastIndexedAt ?? null)
    this.lastStatus = { ...p, lastIndexedAt }
    this.emit(STATUS_EVENT, this.lastStatus)
  }

  private async indexAll(): Promise<void> {
    await this.indexer!.indexAll({
      onProgress: (p) => this.broadcast(p)
    })
  }

  private recoverIndexStore(error: unknown): boolean {
    if (!isRecoverableIndexStoreError(error)) return false
    const dbPath = indexDbPath()
    this.close()
    removeIndexDatabaseFiles(dbPath)
    this.init()
    return true
  }

  private broadcastIndexingError(error: unknown): void {
    this.broadcast({
      ...this.lastStatus,
      phase: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export const indexerService = new IndexerService()
