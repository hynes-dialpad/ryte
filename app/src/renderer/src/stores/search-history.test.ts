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
    const options = { retention: 'forever' as const, includeAnswers: false }
    saveSearchHistory([entry(1)], storage, options)
    expect(loadSearchHistory(storage, options)).toEqual([
      { ...entry(1), answer: '', sources: [], citations: [] }
    ])
  })

  it('can opt into saving answers and citations locally', () => {
    const storage = new MemoryStorage()
    const options = { retention: '30-days' as const, includeAnswers: true, now: 100 }
    saveSearchHistory([entry(1)], storage, options)
    expect(loadSearchHistory(storage, options)).toEqual([entry(1)])
  })

  it('caps persisted history to the retention limit', () => {
    const storage = new MemoryStorage()
    const options = { retention: 'forever' as const, includeAnswers: false }
    saveSearchHistory(
      Array.from({ length: SEARCH_HISTORY_LIMIT + 5 }, (_, index) => entry(index)),
      storage,
      options
    )
    expect(loadSearchHistory(storage, options)).toHaveLength(SEARCH_HISTORY_LIMIT)
  })

  it('drops malformed entries when normalizing history', () => {
    expect(
      normalizeSearchHistory([entry(1), { query: 'missing fields' }, null], {
        retention: 'forever',
        includeAnswers: false
      })
    ).toEqual([{ ...entry(1), answer: '', sources: [], citations: [] }])
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

  it('drops persisted history when retention is off or session-only', () => {
    const storage = new MemoryStorage()
    saveSearchHistory([entry(1)], storage, { retention: 'off', includeAnswers: false })
    expect(storage.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull()

    storage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify([entry(1)]))
    expect(loadSearchHistory(storage, { retention: 'session', includeAnswers: false })).toEqual([])
    expect(storage.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('prunes entries outside the retention window', () => {
    const day = 24 * 60 * 60 * 1000
    expect(
      normalizeSearchHistory([entry(10 * day), entry(1)], {
        retention: '7-days',
        includeAnswers: true,
        now: 10 * day
      })
    ).toEqual([entry(10 * day)])
  })
})
