import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock both providers — SearchService instantiates them at query-time.
const mockSynthesize = vi.fn()
vi.mock('./anthropic-provider', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({ synthesize: mockSynthesize }))
}))
vi.mock('./openai-provider', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({ synthesize: mockSynthesize }))
}))

import { SearchService, type CitationResult } from './search-service'
import type { StoredChunkRow } from '../indexing/vector-store'

// --- minimal dep stubs ---

function makeEmbed(vec = Float32Array.from([1, 0, 0])) {
  return vi.fn().mockResolvedValue([vec])
}

function makeHybridSearch(rows: StoredChunkRow[] = []) {
  return vi.fn().mockReturnValue(rows)
}

function makeSettings(model = 'claude-haiku-4-5', key: string | null = 'sk-test') {
  return {
    load: vi.fn().mockReturnValue({ model }),
    getSecret: vi.fn().mockReturnValue(key)
  }
}

function row(sourcePath: string, text: string, headingPath: string[] = []): StoredChunkRow {
  return { text, sourcePath, headingPath, date: null }
}

function service(
  rows: StoredChunkRow[] = [],
  model = 'claude-haiku-4-5',
  key: string | null = 'sk-test'
): SearchService {
  return new SearchService(
    { embed: makeEmbed() },
    { hybridSearch: makeHybridSearch(rows) },
    makeSettings(model, key)
  )
}

function makeCallbacks() {
  return {
    onToken: vi.fn(),
    onSources: vi.fn(),
    onCitation: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn()
  }
}

// Default synthesize: stream a two-citation answer.
function defaultSynthesize() {
  mockSynthesize.mockImplementation(
    async (_q: string, _chunks: unknown, onToken: (t: string) => void) => {
      onToken('Answer referencing [1] and [2].')
    }
  )
}

describe('SearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    defaultSynthesize()
  })

  it('calls onDone after a successful search', async () => {
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onDone).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('streams tokens via onToken', async () => {
    mockSynthesize.mockImplementation(async (_q: unknown, _c: unknown, onToken: (t: string) => void) => {
      onToken('Hello ')
      onToken('world')
    })
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onToken).toHaveBeenCalledTimes(2)
    expect(cb.onToken).toHaveBeenNthCalledWith(1, 'Hello ')
    expect(cb.onToken).toHaveBeenNthCalledWith(2, 'world')
  })

  it('emits onCitation for each [N] marker referencing a retrieved chunk', async () => {
    const svc = service([row('a.md', 'chunk A'), row('b.md', 'chunk B')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    const citations: CitationResult[] = cb.onCitation.mock.calls.map((c: unknown[]) => c[0] as CitationResult)
    const paths = citations.map((c) => c.sourcePath)
    expect(paths).toContain('a.md')
    expect(paths).toContain('b.md')
  })

  it('does not emit duplicate citations for repeated [N] markers', async () => {
    mockSynthesize.mockImplementation(async (_q: unknown, _c: unknown, onToken: (t: string) => void) => {
      onToken('[1] repeated [1] again')
    })
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    const cited = cb.onCitation.mock.calls.filter((c: unknown[]) => (c[0] as CitationResult).index === 1)
    expect(cited).toHaveLength(1)
  })

  it('calls onError and skips onDone when API key is missing', async () => {
    const svc = service([], 'claude-haiku-4-5', null)
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('uses AnthropicProvider for claude models', async () => {
    const { AnthropicProvider } = await import('./anthropic-provider')
    const svc = service([row('a.md', 'body')], 'claude-haiku-4-5', 'sk-anthropic')
    await svc.search('q', 'req-1', makeCallbacks())
    expect(AnthropicProvider).toHaveBeenCalledWith('sk-anthropic', 'claude-haiku-4-5')
  })

  it('uses OpenAIProvider for gpt models', async () => {
    const { OpenAIProvider } = await import('./openai-provider')
    const svc = service([row('a.md', 'body')], 'gpt-4o-mini', 'sk-openai')
    await svc.search('q', 'req-1', makeCallbacks())
    expect(OpenAIProvider).toHaveBeenCalledWith('sk-openai', 'gpt-4o-mini')
  })

  it('cancel() prevents onToken/onDone from being called for that requestId', async () => {
    // Block at the embed step so we can cancel before the pipeline progresses.
    let resolveEmbed!: (vecs: Float32Array[]) => void
    const blockingEmbed = vi.fn().mockReturnValue(
      new Promise<Float32Array[]>((r) => {
        resolveEmbed = r
      })
    )
    const svc = new SearchService(
      { embed: blockingEmbed },
      { hybridSearch: makeHybridSearch([row('a.md', 'body')]) },
      makeSettings()
    )
    const cb = makeCallbacks()
    const searchPromise = svc.search('q', 'req-cancel', cb)
    svc.cancel('req-cancel')
    resolveEmbed([Float32Array.from([1, 0, 0])]) // unblock embed; pipeline checks cancel and exits
    await searchPromise
    expect(cb.onToken).not.toHaveBeenCalled()
    expect(cb.onDone).not.toHaveBeenCalled()
  })
})
