import type { SearchCitation, SearchSource } from '../../../preload/index'

export interface SearchResultItem {
  sourcePath: string
  title: string
  headingPath: string[]
  preview: string
  matchCount: number
}

/** Derive a readable document title from a workspace-relative path. */
export function documentTitle(sourcePath: string): string {
  const filename = sourcePath.split('/').at(-1) ?? sourcePath
  return filename.replace(/\.[^.]+$/, '') || sourcePath
}

/** Groups retrieved chunks by document and excludes documents already cited by an answer. */
export function buildSearchResults(
  sources: SearchSource[],
  citations: SearchCitation[]
): SearchResultItem[] {
  const citedPaths = new Set(citations.map((citation) => citation.sourcePath))
  const byPath = new Map<string, SearchResultItem>()

  for (const source of sources) {
    if (citedPaths.has(source.sourcePath)) continue

    const existing = byPath.get(source.sourcePath)
    if (existing) {
      const shouldUseSourcePreview = source.matchCount > existing.matchCount
      existing.matchCount += source.matchCount
      if (shouldUseSourcePreview || !existing.preview) {
        existing.preview = source.preview
        existing.headingPath = source.headingPath
      }
      continue
    }

    byPath.set(source.sourcePath, {
      sourcePath: source.sourcePath,
      title: documentTitle(source.sourcePath),
      headingPath: source.headingPath,
      preview: source.preview,
      matchCount: source.matchCount
    })
  }

  return [...byPath.values()]
}
