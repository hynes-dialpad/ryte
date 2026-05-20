import type { SearchCitation, SearchSource } from '../../../preload/index'
import type { SearchHistoryRetention } from '../../../main/settings/settings-store'

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

export interface SearchHistoryOptions {
  retention: SearchHistoryRetention
  includeAnswers: boolean
  now?: number
}

const DEFAULT_HISTORY_OPTIONS: SearchHistoryOptions = {
  retention: '30-days',
  includeAnswers: false
}

function retentionCutoff(options: SearchHistoryOptions): number | null {
  const now = options.now ?? Date.now()
  if (options.retention === '7-days') return now - 7 * 24 * 60 * 60 * 1000
  if (options.retention === '30-days') return now - 30 * 24 * 60 * 60 * 1000
  return null
}

function sanitizeHistoryEntry(entry: HistoryEntry, options: SearchHistoryOptions): HistoryEntry {
  if (options.includeAnswers) return entry
  return {
    ...entry,
    answer: '',
    sources: [],
    citations: []
  }
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

export function normalizeSearchHistory(
  value: unknown,
  options: SearchHistoryOptions = DEFAULT_HISTORY_OPTIONS
): HistoryEntry[] {
  if (!Array.isArray(value)) return []
  if (options.retention === 'off' || options.retention === 'session') return []
  const cutoff = retentionCutoff(options)
  return value
    .filter(isHistoryEntry)
    .filter((entry) => cutoff === null || entry.timestamp >= cutoff)
    .map((entry) => sanitizeHistoryEntry(entry, options))
    .slice(0, SEARCH_HISTORY_LIMIT)
}

function browserStorage(): SearchHistoryStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function loadSearchHistory(
  storage: SearchHistoryStorage | null = browserStorage(),
  options: SearchHistoryOptions = DEFAULT_HISTORY_OPTIONS
): HistoryEntry[] {
  if (!storage) return []
  if (options.retention === 'off' || options.retention === 'session') {
    clearSavedSearchHistory(storage)
    return []
  }
  try {
    return normalizeSearchHistory(
      JSON.parse(storage.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? '[]'),
      options
    )
  } catch {
    return []
  }
}

export function saveSearchHistory(
  history: HistoryEntry[],
  storage: SearchHistoryStorage | null = browserStorage(),
  options: SearchHistoryOptions = DEFAULT_HISTORY_OPTIONS
): void {
  if (!storage) return
  if (options.retention === 'off' || options.retention === 'session') {
    clearSavedSearchHistory(storage)
    return
  }
  try {
    storage.setItem(
      SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizeSearchHistory(history, options))
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
