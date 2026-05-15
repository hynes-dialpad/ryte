import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SearchCitation, SearchSource } from '../../../preload/index'

export type SearchStatus = 'idle' | 'searching' | 'streaming' | 'done' | 'error'

export interface HistoryEntry {
  query: string
  answer: string
  sources: SearchSource[]
  citations: SearchCitation[]
  timestamp: number
}

export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const answer = ref('')
  const sources = ref<SearchSource[]>([])
  const citations = ref<SearchCitation[]>([])
  const status = ref<SearchStatus>('idle')
  const error = ref<string | null>(null)
  const activeRequestId = ref<string | null>(null)
  const history = ref<HistoryEntry[]>([])

  function reset(): void {
    answer.value = ''
    sources.value = []
    citations.value = []
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
      error.value = 'Indexer not ready — configure settings and wait for indexing to complete'
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
      window.ryte.search.onDone((requestId) => {
        if (requestId !== activeRequestId.value) return
        history.value.unshift({
          query: query.value,
          answer: answer.value,
          sources: sources.value,
          citations: citations.value,
          timestamp: Date.now()
        })
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

  return {
    query,
    answer,
    sources,
    citations,
    status,
    error,
    activeRequestId,
    history,
    runQuery,
    cancel,
    bind
  }
})
