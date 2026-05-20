import type { SearchCitation, SearchSource } from '../../../preload/index'

export const SEARCH_HISTORY_LIMIT = 25
export const SEARCH_HISTORY_STORAGE_KEY = 'ryte.search.history.v1'

export interface HistoryEntry {
  query: string
  answer: string
  sources: SearchSource[]
  citations: SearchCitation[]
  timestamp: number
}

interface SearchHistoryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isSource(value: unknown): value is SearchSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<SearchSource>
  return typeof source.sourcePath === 'string' && isStringArray(source.headingPath)
}

function isCitation(value: unknown): value is SearchCitation {
  if (!value || typeof value !== 'object') return false
  const citation = value as Partial<SearchCitation>
  return (
    typeof citation.index === 'number' &&
    Number.isInteger(citation.index) &&
    citation.index > 0 &&
    typeof citation.sourcePath === 'string' &&
    isStringArray(citation.headingPath)
  )
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<HistoryEntry>
  return (
    typeof entry.query === 'string' &&
    typeof entry.answer === 'string' &&
    Array.isArray(entry.sources) &&
    entry.sources.every(isSource) &&
    Array.isArray(entry.citations) &&
    entry.citations.every(isCitation) &&
    typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp)
  )
}

export function normalizeSearchHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(isHistoryEntry).slice(0, SEARCH_HISTORY_LIMIT)
}

function browserStorage(): SearchHistoryStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function loadSearchHistory(
  storage: SearchHistoryStorage | null = browserStorage()
): HistoryEntry[] {
  if (!storage) return []
  try {
    return normalizeSearchHistory(JSON.parse(storage.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export function saveSearchHistory(
  history: HistoryEntry[],
  storage: SearchHistoryStorage | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(
      SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT))
    )
  } catch {
    // Search history is convenience state. Storage failures should not break search.
  }
}

export function clearSavedSearchHistory(
  storage: SearchHistoryStorage | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.removeItem(SEARCH_HISTORY_STORAGE_KEY)
  } catch {
    // Search history is convenience state. Storage failures should not break search.
  }
}
