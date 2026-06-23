export interface FileTreeResponse {
  notesRoot: string
  paths: string[]
}

export interface FileCatalogEntry {
  sourcePath: string
  title: string
  directory: string
  searchableText: string
  pathDate: string | null
  modifiedAt: string
  modifiedAtMs: number
  createdAt: string | null
  createdAtMs: number | null
  sizeBytes: number
}

export interface FileCatalogResponse {
  notesRoot: string
  files: FileCatalogEntry[]
}
