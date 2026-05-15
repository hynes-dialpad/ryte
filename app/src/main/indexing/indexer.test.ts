import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Excluded from `pnpm test` (vitest.config.ts) — see vector-store.test.ts for context.

import { Indexer, type IndexerProgress } from './indexer'
import { IndexStateStore } from './index-state'
import { VectorStore } from './vector-store'
import type { EmbeddingProvider } from './embedder'

const DIM = 4

function fakeEmbedder(): EmbeddingProvider {
  return {
    dim: DIM,
    embed: vi.fn(async (texts: string[]) => texts.map((_, i) => Float32Array.from([i, i, i, i])))
  }
}

describe('Indexer', () => {
  let tempDir: string
  let notesRoot: string
  let dbPath: string
  let store: VectorStore
  let state: IndexStateStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-idx-'))
    notesRoot = join(tempDir, 'notes')
    mkdirSync(notesRoot, { recursive: true })
    dbPath = join(tempDir, 'index.db')
    store = new VectorStore(dbPath)
    store.init(DIM)
    state = new IndexStateStore(store.database)
    state.init()
  })

  afterEach(() => {
    store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function makeIndexer(embedder: EmbeddingProvider = fakeEmbedder()): Indexer {
    return new Indexer({ notesRoot, embedder, vectorStore: store, indexState: state })
  }

  it('indexAll produces correct chunk + file counts on a 3-file fixture', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')
    writeFileSync(join(notesRoot, 'b.md'), '# B\n\nbody B\n## B2\n\nmore B\n')
    writeFileSync(join(notesRoot, 'c.md'), '# C\n\nbody C\n')

    const indexer = makeIndexer()
    const summary = await indexer.indexAll()

    expect(summary.filesIndexed).toBe(3)
    expect(summary.chunksIndexed).toBe(4) // a:1, b:2, c:1
    expect(store.fileCount()).toBe(3)
    expect(store.chunkCount()).toBe(4)
  })

  it('indexAll skips files unchanged since prior run', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const embedder = fakeEmbedder()
    const indexer = makeIndexer(embedder)
    await indexer.indexAll()
    expect(embedder.embed).toHaveBeenCalledTimes(1)

    // Re-run — should skip (mtime unchanged)
    await indexer.indexAll()
    expect(embedder.embed).toHaveBeenCalledTimes(1)
  })

  it('indexAll re-indexes a file when its mtime advances', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const embedder = fakeEmbedder()
    const indexer = makeIndexer(embedder)
    await indexer.indexAll()
    const callsAfterFirst = (embedder.embed as ReturnType<typeof vi.fn>).mock.calls.length

    // Advance mtime
    writeFileSync(filePath, '# A\n\nbody A\n\n# B\n\nbody B\n')
    const future = (Date.now() + 5000) / 1000
    utimesSync(filePath, future, future)

    await indexer.indexAll()
    expect((embedder.embed as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      callsAfterFirst
    )
    expect(store.chunkCount()).toBe(2) // re-indexed file replaces prior chunks
  })

  it('emits onProgress with walking, indexing, done phases', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')

    const events: IndexerProgress[] = []
    const indexer = makeIndexer()
    await indexer.indexAll({ onProgress: (p) => events.push({ ...p }) })

    const phases = events.map((e) => e.phase)
    expect(phases).toContain('walking')
    expect(phases).toContain('indexing')
    expect(phases[phases.length - 1]).toBe('done')
  })

  it('indexFile handles one file and respects mtime skip', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const embedder = fakeEmbedder()
    const indexer = makeIndexer(embedder)
    const first = await indexer.indexFile(filePath)
    expect(first.skipped).toBe(false)
    expect(first.chunkCount).toBe(1)

    const second = await indexer.indexFile(filePath)
    expect(second.skipped).toBe(true)
    expect(second.chunkCount).toBe(0)
    expect(embedder.embed).toHaveBeenCalledTimes(1)
  })

  it('removeFile zeros chunks for that file', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody\n')
    const indexer = makeIndexer()
    await indexer.indexFile(filePath)
    expect(store.chunkCount()).toBe(1)

    await indexer.removeFile(filePath)
    expect(store.chunkCount()).toBe(0)
    expect(state.totals().files).toBe(0)
  })

  it('indexAll handles empty notes root gracefully', async () => {
    const indexer = makeIndexer()
    const summary = await indexer.indexAll()
    expect(summary).toEqual({ filesIndexed: 0, chunksIndexed: 0 })
  })
})
