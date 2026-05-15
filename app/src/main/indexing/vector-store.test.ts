import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Excluded from `pnpm test` (vitest.config.ts) because better-sqlite3 is
// compiled for Electron ABI during dev. Kept for reference / manual run
// under Node ABI. Behavior validated via scripts/smoke-indexer.ts + TS-001.

import { VectorStore, type ChunkWithVector } from './vector-store'

const DIM = 4 // small dim for tests

function fakeChunk(sourcePath: string, headingPath: string[], text: string): ChunkWithVector {
  return {
    chunk: {
      text,
      sourcePath,
      headingPath,
      date: null,
      frontmatter: {}
    },
    vector: Float32Array.from([1, 0, 0, 0])
  }
}

describe('VectorStore', () => {
  let tempDir: string
  let dbPath: string
  let store: VectorStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-vs-'))
    dbPath = join(tempDir, 'index.db')
    store = new VectorStore(dbPath)
    store.init(DIM)
  })

  afterEach(() => {
    store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('initializes with vec extension loaded and reports a version', () => {
    const version = store.vecVersion()
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  })

  it('starts empty: chunkCount and fileCount are 0', () => {
    expect(store.chunkCount()).toBe(0)
    expect(store.fileCount()).toBe(0)
  })

  it('inserts chunks via replaceFileChunks and counts them', () => {
    store.replaceFileChunks('a.md', [
      fakeChunk('a.md', ['H1'], 'body1'),
      fakeChunk('a.md', ['H1', 'H2'], 'body2')
    ])
    expect(store.chunkCount()).toBe(2)
    expect(store.fileCount()).toBe(1)
  })

  it('atomically replaces chunks for a file (old chunks deleted, new chunks inserted)', () => {
    store.replaceFileChunks('a.md', [
      fakeChunk('a.md', ['H1'], 'old1'),
      fakeChunk('a.md', ['H1'], 'old2')
    ])
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['H1'], 'new1')])
    expect(store.chunkCount()).toBe(1)
  })

  it('counts unique files via fileCount', () => {
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['A'], 'a')])
    store.replaceFileChunks('b.md', [fakeChunk('b.md', ['B'], 'b')])
    expect(store.fileCount()).toBe(2)
  })

  it('deleteFileChunks removes all chunks for a file', () => {
    store.replaceFileChunks('a.md', [
      fakeChunk('a.md', ['A'], 'a1'),
      fakeChunk('a.md', ['A'], 'a2')
    ])
    store.replaceFileChunks('b.md', [fakeChunk('b.md', ['B'], 'b')])
    store.deleteFileChunks('a.md')
    expect(store.chunkCount()).toBe(1)
    expect(store.fileCount()).toBe(1)
  })

  it('persists across reopen', () => {
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['A'], 'a1')])
    store.close()
    const store2 = new VectorStore(dbPath)
    store2.init(DIM)
    expect(store2.chunkCount()).toBe(1)
    store2.close()
  })

  it('round-trips chunk text and heading_path', () => {
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['Outer', 'Inner'], 'hello world')])
    const rows = store.allChunksForFile('a.md')
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('hello world')
    expect(rows[0].headingPath).toEqual(['Outer', 'Inner'])
  })
})
