import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  clearSavedSearchHistory,
  loadSearchHistory,
  saveSearchHistory,
  SEARCH_HISTORY_LIMIT,
  type HistoryEntry,
  type SearchHistoryOptions
} from './search-history'
import type { SearchCitation, SearchNotice, SearchSource } from '../../../preload/index'

export type SearchStatus = 'idle' | 'searching' | 'streaming' | 'done' | 'error'

export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const answer = ref('')
  const sources = ref<SearchSource[]>([])
  const citations = ref<SearchCitation[]>([])
  const notices = ref<SearchNotice[]>([])
  const status = ref<SearchStatus>('idle')
  const error = ref<string | null>(null)
  const activeRequestId = ref<string | null>(null)
  const history = ref<HistoryEntry[]>([])
  const historyOptions = ref<SearchHistoryOptions>({
    retention: '30-days',
    includeAnswers: false
  })

  function reset(): void {
    answer.value = ''
    sources.value = []
    citations.value = []
    notices.value = []
    status.value = 'idle'
    error.value = null
    activeRequestId.value = null
  }

  async function runQuery(q: string): Promise<void> {
    reset()
    query.value = q
    status.value = 'searching'
    activeRequestId.value = await window.ryte.search.query(q)
    if (!activeRequestId.value) {
      status.value = 'error'
      error.value = 'Indexer not ready — wait for local indexing to initialize'
    }
  }

  async function cancel(): Promise<void> {
    if (activeRequestId.value) {
      await window.ryte.search.cancel(activeRequestId.value)
    }
    reset()
  }

  // Tracks the active IPC listener cleanup so re-calls (e.g. HMR) remove old listeners first.
  let _cleanup: (() => void) | null = null

  function bind(): () => void {
    _cleanup?.()
    const cleanups: Array<() => void> = []

    cleanups.push(
      window.ryte.search.onSources((requestId, retrieved) => {
        if (requestId !== activeRequestId.value) return
        sources.value = retrieved
      })
    )

    cleanups.push(
      window.ryte.search.onToken((requestId, token) => {
        if (requestId !== activeRequestId.value) return
        status.value = 'streaming'
        answer.value += token
      })
    )

    cleanups.push(
      window.ryte.search.onCitation((requestId, citation) => {
        if (requestId !== activeRequestId.value) return
        citations.value.push(citation)
      })
    )

    cleanups.push(
      window.ryte.search.onNotice((requestId, notice) => {
        if (requestId !== activeRequestId.value) return
        notices.value.push(notice)
      })
    )

    cleanups.push(
      window.ryte.search.onDone((requestId) => {
        if (requestId !== activeRequestId.value) return
        if (historyOptions.value.retention !== 'off') {
          const entry = {
            query: query.value,
            answer: historyOptions.value.includeAnswers ? answer.value : '',
            sources: historyOptions.value.includeAnswers ? sources.value : [],
            citations: historyOptions.value.includeAnswers ? citations.value : [],
            timestamp: Date.now()
          }
          history.value = [entry, ...history.value].slice(0, SEARCH_HISTORY_LIMIT)
          saveSearchHistory(history.value, undefined, historyOptions.value)
        }
        status.value = 'done'
        activeRequestId.value = null
      })
    )

    cleanups.push(
      window.ryte.search.onError((requestId, msg) => {
        if (requestId !== activeRequestId.value) return
        status.value = 'error'
        error.value = msg
        activeRequestId.value = null
      })
    )

    _cleanup = () => cleanups.forEach((fn) => fn())
    return _cleanup
  }

  function clearHistory(): void {
    history.value = []
    clearSavedSearchHistory()
  }

  function configureHistory(options: SearchHistoryOptions): void {
    const previousRetention = historyOptions.value.retention
    historyOptions.value = options
    if (options.retention === 'off') {
      history.value = []
      clearSavedSearchHistory()
      return
    }
    if (options.retention === 'session') {
      if (previousRetention !== 'session') {
        history.value = []
      } else if (!options.includeAnswers) {
        history.value = history.value.map((entry) => ({
          ...entry,
          answer: '',
          sources: [],
          citations: []
        }))
      }
      clearSavedSearchHistory()
      return
    }
    history.value = loadSearchHistory(undefined, options)
    saveSearchHistory(history.value, undefined, options)
  }

  return {
    query,
    answer,
    sources,
    citations,
    notices,
    status,
    error,
    activeRequestId,
    history,
    runQuery,
    cancel,
    bind,
    clearHistory,
    configureHistory
  }
})
