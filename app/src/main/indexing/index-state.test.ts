import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IndexStateStore } from './index-state'

// Excluded from `pnpm test` (vitest.config.ts) — see vector-store.test.ts for context.

describe('IndexStateStore', () => {
  let tempDir: string
  let db: ReturnType<typeof Database>
  let store: IndexStateStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-is-'))
    db = new Database(join(tempDir, 'index.db'))
    store = new IndexStateStore(db)
    store.init()
  })

  afterEach(() => {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('reports shouldReindex=true for unseen file', () => {
    expect(store.shouldReindex('a.md', 100)).toBe(true)
  })

  it('reports shouldReindex=false after markIndexed with same mtime', () => {
    store.markIndexed('a.md', 100, 5)
    expect(store.shouldReindex('a.md', 100)).toBe(false)
  })

  it('reports shouldReindex=true when mtime is newer than recorded', () => {
    store.markIndexed('a.md', 100, 5)
    expect(store.shouldReindex('a.md', 101)).toBe(true)
  })

  it('totals reflects sum of chunk counts across files', () => {
    store.markIndexed('a.md', 100, 5)
    store.markIndexed('b.md', 200, 3)
    expect(store.totals()).toEqual({ files: 2, chunks: 8 })
  })

  it('markRemoved drops a file from totals', () => {
    store.markIndexed('a.md', 100, 5)
    store.markIndexed('b.md', 200, 3)
    store.markRemoved('a.md')
    expect(store.totals()).toEqual({ files: 1, chunks: 3 })
  })

  it('lists tracked source paths in stable order', () => {
    store.markIndexed('b.md', 100, 1)
    store.markIndexed('a.md', 100, 1)
    expect(store.allSourcePaths()).toEqual(['a.md', 'b.md'])
  })

  it('markIndexed on existing path updates mtime and chunk count', () => {
    store.markIndexed('a.md', 100, 5)
    store.markIndexed('a.md', 200, 7)
    expect(store.totals()).toEqual({ files: 1, chunks: 7 })
    expect(store.shouldReindex('a.md', 200)).toBe(false)
    expect(store.shouldReindex('a.md', 100)).toBe(false) // older mtime is not newer
  })

  it('persists across reconstruction (same db handle)', () => {
    store.markIndexed('a.md', 100, 5)
    const store2 = new IndexStateStore(db)
    store2.init()
    expect(store2.totals()).toEqual({ files: 1, chunks: 5 })
  })
})
