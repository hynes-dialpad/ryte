import { EventEmitter } from 'node:events'

import { Indexer, type IndexerProgress } from './indexer'
import { IndexStateStore } from './index-state'
import { OpenAIEmbeddingProvider } from './embedder'
import { VectorStore } from './vector-store'
import { settingsStore } from '../settings/settings-store'
import { indexDbPath } from '../paths'

const STATUS_EVENT = 'status'

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
    chunksDone: 0
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
    this.embedder = embedder
    this.vectorStore = new VectorStore(indexDbPath())
    this.vectorStore.init(embedder?.dim ?? 1536)
    this.indexState = new IndexStateStore(this.vectorStore.database)
    this.indexState.init()
    this.indexer = new Indexer({
      notesRoot: settings.notesRoot,
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
      chunksDone: totals.chunks
    }
    return true
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
      await this.indexer!.indexAll({
        onProgress: (p) => this.broadcast(p)
      })
    } catch (err) {
      this.broadcast({
        ...this.lastStatus,
        phase: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
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
    this.lastStatus = p
    this.emit(STATUS_EVENT, p)
  }
}

export const indexerService = new IndexerService()
