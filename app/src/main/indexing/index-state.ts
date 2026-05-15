import type { Database as DatabaseType } from 'better-sqlite3'

export interface IndexTotals {
  files: number
  chunks: number
}

/**
 * Per-file mtime tracking. Lives alongside chunks/chunk_vectors in the same
 * index.db. Lets the indexer skip unchanged files on re-launch.
 */
export class IndexStateStore {
  constructor(private readonly db: DatabaseType) {}

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_state (
        source_path TEXT PRIMARY KEY,
        mtime_ms INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL
      )
    `)
  }

  shouldReindex(sourcePath: string, mtimeMs: number): boolean {
    const row = this.db
      .prepare('SELECT mtime_ms AS mtime FROM file_state WHERE source_path = ?')
      .get(sourcePath) as { mtime: number } | undefined
    if (!row) return true
    return row.mtime < mtimeMs
  }

  markIndexed(sourcePath: string, mtimeMs: number, chunkCount: number): void {
    this.db
      .prepare(
        `INSERT INTO file_state (source_path, mtime_ms, chunk_count) VALUES (?, ?, ?)
         ON CONFLICT(source_path) DO UPDATE SET mtime_ms = excluded.mtime_ms, chunk_count = excluded.chunk_count`
      )
      .run(sourcePath, mtimeMs, chunkCount)
  }

  markRemoved(sourcePath: string): void {
    this.db.prepare('DELETE FROM file_state WHERE source_path = ?').run(sourcePath)
  }

  totals(): IndexTotals {
    const row = this.db
      .prepare('SELECT COUNT(*) AS files, COALESCE(SUM(chunk_count), 0) AS chunks FROM file_state')
      .get() as { files: number; chunks: number }
    return { files: row.files, chunks: row.chunks }
  }
}
