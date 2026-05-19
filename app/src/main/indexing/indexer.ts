import { stat } from 'node:fs/promises'
import { relative } from 'node:path'

import { chunkFile, type Chunk } from './chunker'
import type { EmbeddingProvider } from './embedder'
import type { IndexStateStore } from './index-state'
import type { ChunkWithVector, VectorStore } from './vector-store'
import { walkNotes } from './walker'

export interface IndexerDeps {
  notesRoot: string
  embedder: EmbeddingProvider | null
  vectorStore: VectorStore
  indexState: IndexStateStore
}

export type IndexerPhase = 'idle' | 'walking' | 'indexing' | 'done' | 'error'

export interface IndexerProgress {
  phase: IndexerPhase
  filesTotal: number
  filesDone: number
  chunksTotal: number
  chunksDone: number
  error?: string
}

export interface IndexAllOptions {
  onProgress?: (p: IndexerProgress) => void
}

export interface IndexAllSummary {
  filesIndexed: number
  chunksIndexed: number
}

interface PendingFile {
  absPath: string
  relPath: string
  mtimeMs: number
  chunks: Chunk[]
}

export class Indexer {
  constructor(private readonly deps: IndexerDeps) {}

  async indexAll(opts: IndexAllOptions = {}): Promise<IndexAllSummary> {
    const { notesRoot, embedder, vectorStore, indexState } = this.deps
    const emit = (p: IndexerProgress): void => opts.onProgress?.(p)

    emit({ phase: 'walking', filesTotal: 0, filesDone: 0, chunksTotal: 0, chunksDone: 0 })
    const allPaths = await walkNotes(notesRoot)

    // Phase 1: stat + chunk all files needing re-index.
    const pending: PendingFile[] = []
    for (const absPath of allPaths) {
      const relPath = relative(notesRoot, absPath)
      const stats = await stat(absPath)
      const mtimeMs = Math.floor(stats.mtimeMs)
      if (!indexState.shouldReindex(relPath, mtimeMs)) continue
      const chunks = chunkFile(absPath, notesRoot)
      if (chunks.length === 0) continue
      pending.push({ absPath, relPath, mtimeMs, chunks })
    }

    const chunksTotal = pending.reduce((acc, p) => acc + p.chunks.length, 0)
    const filesTotal = pending.length
    let chunksDone = 0
    let filesDone = 0

    if (filesTotal === 0) {
      emit({ phase: 'done', filesTotal: 0, filesDone: 0, chunksTotal: 0, chunksDone: 0 })
      return { filesIndexed: 0, chunksIndexed: 0 }
    }

    emit({ phase: 'indexing', filesTotal, filesDone, chunksTotal, chunksDone })

    // Phase 2: embed file-by-file (simple, predictable; can batch across files later if needed).
    for (const file of pending) {
      if (embedder) {
        const texts = file.chunks.map((c) => c.text)
        const vectors = await embedder.embed(texts)
        const items: ChunkWithVector[] = file.chunks.map((chunk, i) => ({
          chunk,
          vector: vectors[i]
        }))
        vectorStore.replaceFileChunks(file.relPath, items)
      } else {
        vectorStore.replaceFileTextChunks(file.relPath, file.chunks)
      }
      indexState.markIndexed(file.relPath, file.mtimeMs, file.chunks.length)

      filesDone += 1
      chunksDone += file.chunks.length
      emit({ phase: 'indexing', filesTotal, filesDone, chunksTotal, chunksDone })
    }

    emit({ phase: 'done', filesTotal, filesDone, chunksTotal, chunksDone })
    return { filesIndexed: filesDone, chunksIndexed: chunksDone }
  }

  async indexFile(absPath: string): Promise<{ chunkCount: number; skipped: boolean }> {
    const { notesRoot, embedder, vectorStore, indexState } = this.deps
    const relPath = relative(notesRoot, absPath)
    const stats = await stat(absPath)
    const mtimeMs = Math.floor(stats.mtimeMs)
    if (!indexState.shouldReindex(relPath, mtimeMs)) {
      return { chunkCount: 0, skipped: true }
    }
    const chunks = chunkFile(absPath, notesRoot)
    if (chunks.length === 0) {
      vectorStore.deleteFileChunks(relPath)
      indexState.markIndexed(relPath, mtimeMs, 0)
      return { chunkCount: 0, skipped: false }
    }
    if (embedder) {
      const vectors = await embedder.embed(chunks.map((c) => c.text))
      vectorStore.replaceFileChunks(
        relPath,
        chunks.map((chunk, i) => ({ chunk, vector: vectors[i] }))
      )
    } else {
      vectorStore.replaceFileTextChunks(relPath, chunks)
    }
    indexState.markIndexed(relPath, mtimeMs, chunks.length)
    return { chunkCount: chunks.length, skipped: false }
  }

  async removeFile(absPath: string): Promise<void> {
    const relPath = relative(this.deps.notesRoot, absPath)
    this.deps.vectorStore.deleteFileChunks(relPath)
    this.deps.indexState.markRemoved(relPath)
  }
}
