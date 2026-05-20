import { describe, expect, it } from 'vitest'

import {
  clearSavedSearchHistory,
  loadSearchHistory,
  normalizeSearchHistory,
  saveSearchHistory,
  SEARCH_HISTORY_LIMIT,
  SEARCH_HISTORY_STORAGE_KEY,
  type HistoryEntry
} from './search-history'

class MemoryStorage {
  private readonly items = new Map<string, string>()

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }
}

function entry(index: number): HistoryEntry {
  return {
    query: `query ${index}`,
    answer: `answer ${index}`,
    sources: [{ sourcePath: `source-${index}.md`, headingPath: ['Heading'] }],
    citations: [{ index: 1, sourcePath: `source-${index}.md`, headingPath: ['Heading'] }],
    timestamp: index
  }
}

describe('search history persistence', () => {
  it('saves and loads valid history entries', () => {
    const storage = new MemoryStorage()
    saveSearchHistory([entry(1)], storage)
    expect(loadSearchHistory(storage)).toEqual([entry(1)])
  })

  it('caps persisted history to the retention limit', () => {
    const storage = new MemoryStorage()
    saveSearchHistory(
      Array.from({ length: SEARCH_HISTORY_LIMIT + 5 }, (_, index) => entry(index)),
      storage
    )
    expect(loadSearchHistory(storage)).toHaveLength(SEARCH_HISTORY_LIMIT)
  })

  it('drops malformed entries when normalizing history', () => {
    expect(normalizeSearchHistory([entry(1), { query: 'missing fields' }, null])).toEqual([
      entry(1)
    ])
  })

  it('returns empty history for invalid JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(SEARCH_HISTORY_STORAGE_KEY, '{bad json')
    expect(loadSearchHistory(storage)).toEqual([])
  })

  it('clears saved history', () => {
    const storage = new MemoryStorage()
    saveSearchHistory([entry(1)], storage)
    clearSavedSearchHistory(storage)
    expect(loadSearchHistory(storage)).toEqual([])
  })
})
