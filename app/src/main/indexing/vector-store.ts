import Database, { type Database as DatabaseType } from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

import type { Chunk } from './chunker'

export interface ChunkWithVector {
  chunk: Chunk
  vector: Float32Array
}

export interface StoredChunkRow {
  text: string
  sourcePath: string
  headingPath: string[]
  date: string | null
}

export class VectorStore {
  private db: DatabaseType | null = null
  private dim = 0

  constructor(private readonly dbPath: string) {}

  init(dim: number): void {
    this.dim = dim
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    sqliteVec.load(this.db)
    this.createSchema()
  }

  get database(): DatabaseType {
    if (!this.db) throw new Error('VectorStore not initialized — call init() first')
    return this.db
  }

  vecVersion(): string {
    const row = this.database.prepare('SELECT vec_version() AS v').get() as { v: string }
    return row.v
  }

  chunkCount(): number {
    const row = this.database.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }
    return row.n
  }

  fileCount(): number {
    const row = this.database
      .prepare('SELECT COUNT(DISTINCT source_path) AS n FROM chunks')
      .get() as { n: number }
    return row.n
  }

  allChunksForFile(sourcePath: string): StoredChunkRow[] {
    const rows = this.database
      .prepare(
        'SELECT text, source_path AS sourcePath, heading_path AS headingPath, date FROM chunks WHERE source_path = ? ORDER BY id'
      )
      .all(sourcePath) as Array<{
      text: string
      sourcePath: string
      headingPath: string
      date: string | null
    }>
    return rows.map((r) => ({
      text: r.text,
      sourcePath: r.sourcePath,
      headingPath: JSON.parse(r.headingPath) as string[],
      date: r.date
    }))
  }

  replaceFileChunks(sourcePath: string, items: ChunkWithVector[]): void {
    const db = this.database
    const txn = db.transaction((path: string, list: ChunkWithVector[]) => {
      const oldIds = db.prepare('SELECT id FROM chunks WHERE source_path = ?').all(path) as Array<{
        id: number
      }>
      const deleteVec = db.prepare('DELETE FROM chunk_vectors WHERE rowid = ?')
      for (const { id } of oldIds) deleteVec.run(id)
      db.prepare('DELETE FROM chunks WHERE source_path = ?').run(path)

      const insertChunk = db.prepare(
        'INSERT INTO chunks (source_path, heading_path, date, frontmatter, text) VALUES (?, ?, ?, ?, ?)'
      )
      const insertVec = db.prepare('INSERT INTO chunk_vectors (rowid, embedding) VALUES (?, ?)')
      for (const { chunk, vector } of list) {
        if (vector.length !== this.dim) {
          throw new Error(`Vector dim ${vector.length} does not match store dim ${this.dim}`)
        }
        const info = insertChunk.run(
          chunk.sourcePath,
          JSON.stringify(chunk.headingPath),
          chunk.date,
          JSON.stringify(chunk.frontmatter),
          chunk.text
        )
        const id = BigInt(info.lastInsertRowid)
        insertVec.run(id, vector)
      }
    })
    txn(sourcePath, items)
  }

  deleteFileChunks(sourcePath: string): void {
    const db = this.database
    const txn = db.transaction((path: string) => {
      const oldIds = db.prepare('SELECT id FROM chunks WHERE source_path = ?').all(path) as Array<{
        id: number
      }>
      const deleteVec = db.prepare('DELETE FROM chunk_vectors WHERE rowid = ?')
      for (const { id } of oldIds) deleteVec.run(id)
      db.prepare('DELETE FROM chunks WHERE source_path = ?').run(path)
    })
    txn(sourcePath)
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private createSchema(): void {
    const db = this.database
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL,
        heading_path TEXT NOT NULL,
        date TEXT,
        frontmatter TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_source_path ON chunks (source_path);
    `)
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(embedding float[${this.dim}])`
    )
  }
}
