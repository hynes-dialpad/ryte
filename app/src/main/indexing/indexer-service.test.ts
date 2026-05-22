import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  vectorStoreInit: vi.fn(),
  vectorStoreClose: vi.fn(),
  indexerIndexAll: vi.fn()
}))

vi.mock('./vector-store', () => ({
  VectorStore: vi.fn().mockImplementation(() => ({
    init: mocks.vectorStoreInit,
    close: mocks.vectorStoreClose,
    database: {}
  }))
}))

vi.mock('./index-state', () => ({
  IndexStateStore: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    totals: vi.fn().mockReturnValue({ files: 0, chunks: 0 })
  }))
}))

vi.mock('./indexer', () => ({
  Indexer: vi.fn().mockImplementation(() => ({
    indexAll: mocks.indexerIndexAll
  }))
}))

vi.mock('../settings/settings-store', () => ({
  settingsStore: {
    getSecret: vi.fn().mockReturnValue(null),
    load: vi.fn().mockReturnValue({
      schemaVersion: 3,
      notesRoot: '/tmp/notes',
      cloudAnswersEnabled: false,
      semanticIndexEnabled: false,
      cloudAnswersAcknowledgement: null,
      semanticIndexAcknowledgement: null,
      answerProvider: 'openai',
      answerModel: 'gpt-5.2',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      searchHistoryRetention: '30-days',
      searchHistoryIncludesAnswers: false,
      encryptedKeys: {},
      providerKeyMetadata: {}
    })
  }
}))

vi.mock('../paths', () => ({
  indexDbPath: vi.fn().mockReturnValue('/tmp/test-indexer-service.db')
}))

const mockEmbed = vi.fn().mockResolvedValue([Float32Array.from([1, 0, 0])])

vi.mock('./embedder', () => ({
  OpenAIEmbeddingProvider: vi.fn().mockImplementation(() => ({
    dim: 1536,
    embed: mockEmbed
  }))
}))

describe('IndexerService.embed()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vectorStoreInit.mockReturnValue(undefined)
    mocks.indexerIndexAll.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 0 })
    mockEmbed.mockResolvedValue([Float32Array.from([1, 0, 0])])
  })

  it('throws when no embedding provider is configured', async () => {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()
    await expect(svc.embed(['hello'])).rejects.toThrow('No embedding provider configured')
  })

  it('delegates to the embedder when initialized', async () => {
    const { settingsStore } = await import('../settings/settings-store')
    const { IndexerService } = await import('./indexer-service')
    vi.mocked(settingsStore.getSecret).mockReturnValue('sk-test')
    vi.mocked(settingsStore.load).mockReturnValue({
      schemaVersion: 4,
      notesRoot: '/tmp/notes',
      cloudAnswersEnabled: false,
      semanticIndexEnabled: true,
      cloudAnswersAcknowledgement: null,
      semanticIndexAcknowledgement: null,
      answerProvider: 'openai',
      answerModel: 'gpt-5.2',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      searchHistoryRetention: '30-days',
      searchHistoryIncludesAnswers: false,
      scrollbarVisibility: 'auto',
      encryptedKeys: {},
      providerKeyMetadata: {}
    })
    const svc = new IndexerService()
    svc.init()
    const result = await svc.embed(['hello world'])
    expect(mockEmbed).toHaveBeenCalledWith(['hello world'])
    expect(result).toHaveLength(1)
    expect(result[0]).toBeInstanceOf(Float32Array)
  })

  it('rebuilds the index database when initialization sees a malformed database', async () => {
    const { IndexerService } = await import('./indexer-service')
    mocks.vectorStoreInit
      .mockImplementationOnce(() => {
        throw new Error('database disk image is malformed')
      })
      .mockImplementation(() => undefined)

    const svc = new IndexerService()
    svc.init()

    expect(mocks.vectorStoreClose).toHaveBeenCalled()
    expect(mocks.vectorStoreInit).toHaveBeenCalledTimes(2)
  })

  it('rebuilds and retries once when reindexing sees a malformed database', async () => {
    const { IndexerService } = await import('./indexer-service')
    mocks.indexerIndexAll
      .mockRejectedValueOnce(new Error('database disk image is malformed'))
      .mockResolvedValueOnce({ filesIndexed: 0, chunksIndexed: 0 })

    const svc = new IndexerService()
    svc.init()
    await svc.triggerReindex()

    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
    expect(mocks.vectorStoreClose).toHaveBeenCalled()
    expect(mocks.vectorStoreInit).toHaveBeenCalledTimes(2)
    expect(svc.getStatus().phase).not.toBe('error')
  })

  it('clears the local index store and rebuilds on request', async () => {
    const { IndexerService } = await import('./indexer-service')

    const svc = new IndexerService()
    svc.init()
    await svc.clearAndRebuild()

    expect(mocks.vectorStoreClose).toHaveBeenCalled()
    expect(mocks.vectorStoreInit).toHaveBeenCalledTimes(2)
    expect(mocks.indexerIndexAll).toHaveBeenCalledOnce()
  })
})
