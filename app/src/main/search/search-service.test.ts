import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock both providers — SearchService instantiates them at query-time.
const mockSynthesize = vi.fn()
vi.mock('./anthropic-provider', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({ synthesize: mockSynthesize }))
}))
vi.mock('./openai-provider', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({ synthesize: mockSynthesize }))
}))

import { SearchService, type CitationResult, type SearchCallbacks } from './search-service'
import type { StoredChunkRow } from '../indexing/vector-store'
import { modelProvider, type ModelId } from '../settings/settings-store'

// --- minimal dep stubs ---

type MockSearchCallbacks = {
  [K in keyof SearchCallbacks]: ReturnType<typeof vi.fn>
}

function makeEmbed(vec = Float32Array.from([1, 0, 0])): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue([vec])
}

function makeHybridSearch(rows: StoredChunkRow[] = []): ReturnType<typeof vi.fn> {
  return vi.fn().mockReturnValue(rows)
}

function makeKeywordSearch(rows: StoredChunkRow[] = []): ReturnType<typeof vi.fn> {
  return vi.fn().mockReturnValue(rows)
}

function makeRetrieve(rows: StoredChunkRow[] = []): {
  hybridSearch: ReturnType<typeof vi.fn>
  keywordSearch: ReturnType<typeof vi.fn>
} {
  return {
    hybridSearch: makeHybridSearch(rows),
    keywordSearch: makeKeywordSearch(rows)
  }
}

function makeSettings(
  model: ModelId = 'claude-haiku-4-5',
  key: string | null = 'sk-test',
  opts: {
    cloudAnswersEnabled?: boolean
    cloudAnswersAcknowledgement?: { acknowledgedAt: string } | null
  } = {}
): {
  load: ReturnType<typeof vi.fn>
  getSecret: ReturnType<typeof vi.fn>
} {
  return {
    load: vi.fn().mockReturnValue({
      cloudAnswersEnabled: opts.cloudAnswersEnabled ?? true,
      cloudAnswersAcknowledgement:
        opts.cloudAnswersAcknowledgement === undefined
          ? { acknowledgedAt: '2026-05-19T12:00:00.000Z' }
          : opts.cloudAnswersAcknowledgement,
      answerProvider: modelProvider(model),
      answerModel: model
    }),
    getSecret: vi.fn(() => key)
  }
}

function row(sourcePath: string, text: string, headingPath: string[] = []): StoredChunkRow {
  return { text, sourcePath, headingPath, date: null }
}

function service(
  rows: StoredChunkRow[] = [],
  model: ModelId = 'claude-haiku-4-5',
  key: string | null = 'sk-test'
): SearchService {
  return new SearchService({ embed: makeEmbed() }, makeRetrieve(rows), makeSettings(model, key))
}

function makeCallbacks(): MockSearchCallbacks {
  return {
    onToken: vi.fn(),
    onSources: vi.fn(),
    onCitation: vi.fn(),
    onNotice: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn()
  }
}

// Default synthesize: stream a two-citation answer.
function defaultSynthesize(): void {
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
    mockSynthesize.mockImplementation(
      async (_q: unknown, _c: unknown, onToken: (t: string) => void) => {
        onToken('Hello ')
        onToken('world')
      }
    )
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
    const citations: CitationResult[] = cb.onCitation.mock.calls.map(
      (c: unknown[]) => c[0] as CitationResult
    )
    const paths = citations.map((c) => c.sourcePath)
    expect(paths).toContain('a.md')
    expect(paths).toContain('b.md')
  })

  it('does not emit duplicate citations for repeated [N] markers', async () => {
    mockSynthesize.mockImplementation(
      async (_q: unknown, _c: unknown, onToken: (t: string) => void) => {
        onToken('[1] repeated [1] again')
      }
    )
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    const cited = cb.onCitation.mock.calls.filter(
      (c: unknown[]) => (c[0] as CitationResult).index === 1
    )
    expect(cited).toHaveLength(1)
  })

  it('returns local sources without synthesis when API key is missing', async () => {
    const svc = service([row('a.md', 'body')], 'claude-haiku-4-5', null)
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'provider-key-missing',
      message: 'Cloud answer skipped because no Anthropic API key is saved for claude-haiku-4-5.'
    })
    expect(cb.onError).not.toHaveBeenCalled()
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('reports when no local sources are found', async () => {
    const svc = service([])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onSources).toHaveBeenCalledWith([])
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'no-local-sources',
      message: 'No local sources found. Try a different query or rebuild the local index.'
    })
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('does not synthesize when cloud answers are disabled', async () => {
    const svc = new SearchService(
      { embed: makeEmbed() },
      makeRetrieve([row('local.md', 'local result')]),
      makeSettings('gpt-5.2', 'sk-openai', { cloudAnswersEnabled: false })
    )
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onSources).toHaveBeenCalledWith([{ sourcePath: 'local.md', headingPath: [] }])
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'cloud-answers-disabled',
      message: 'Cloud answer skipped because Cloud Answers are disabled in Settings.'
    })
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('does not synthesize before first cloud-use acknowledgement', async () => {
    const svc = new SearchService(
      { embed: makeEmbed() },
      makeRetrieve([row('local.md', 'local result')]),
      makeSettings('gpt-5.2', 'sk-openai', { cloudAnswersAcknowledgement: null })
    )
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'cloud-answers-not-acknowledged',
      message: 'Cloud answer skipped until the first-use warning is accepted.'
    })
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('falls back to keyword search when embeddings are unavailable', async () => {
    const embed = vi.fn().mockRejectedValue(new Error('No embedding provider configured'))
    const retrieve = makeRetrieve([row('local.md', 'keyword result')])
    const svc = new SearchService({ embed }, retrieve, makeSettings('claude-haiku-4-5', null))
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(retrieve.keywordSearch).toHaveBeenCalledWith('q', 15)
    expect(cb.onSources).toHaveBeenCalledWith([{ sourcePath: 'local.md', headingPath: [] }])
    expect(cb.onDone).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('adds provider and model context to synthesis errors', async () => {
    mockSynthesize.mockRejectedValue(new Error('bad request'))
    const svc = service([row('a.md', 'body')], 'gpt-5.2', 'sk-openai')
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onSources).toHaveBeenCalledWith([{ sourcePath: 'a.md', headingPath: [] }])
    expect(cb.onError).toHaveBeenCalledWith('OpenAI gpt-5.2 answer failed: bad request')
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

  it('passes an abort signal to provider synthesis', async () => {
    const svc = service([row('a.md', 'body')], 'gpt-5.2', 'sk-openai')
    await svc.search('q', 'req-1', makeCallbacks())
    const options = mockSynthesize.mock.calls[0][3] as { signal?: AbortSignal }
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('cancel() aborts an active provider stream', async () => {
    let signal: AbortSignal | undefined
    mockSynthesize.mockImplementation(
      async (_q: unknown, _c: unknown, _onToken: unknown, options: { signal?: AbortSignal }) => {
        signal = options.signal
        await new Promise<void>((resolve) => {
          options.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      }
    )
    const svc = service([row('a.md', 'body')], 'gpt-5.2', 'sk-openai')
    const cb = makeCallbacks()
    const searchPromise = svc.search('q', 'req-stream-cancel', cb)
    await vi.waitFor(() => expect(signal).toBeDefined())
    svc.cancel('req-stream-cancel')
    await searchPromise
    expect(signal?.aborted).toBe(true)
    expect(cb.onDone).not.toHaveBeenCalled()
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
      makeRetrieve([row('a.md', 'body')]),
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
