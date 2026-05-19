import { AnthropicProvider } from './anthropic-provider'
import { type LLMProvider, type SearchChunk } from './llm-provider'
import { OpenAIProvider } from './openai-provider'
import { type StoredChunkRow } from '../indexing/vector-store'
import {
  type AnswerModelId,
  type AnswerProviderId,
  type ProviderId
} from '../settings/settings-store'

export interface CitationResult {
  index: number
  sourcePath: string
  headingPath: string[]
}

export interface SourceResult {
  sourcePath: string
  headingPath: string[]
}

export type SearchNoticeCode =
  | 'no-local-sources'
  | 'cloud-answers-disabled'
  | 'cloud-answers-not-acknowledged'
  | 'provider-key-missing'

export interface SearchNotice {
  code: SearchNoticeCode
  message: string
}

export interface SearchCallbacks {
  onToken: (token: string) => void
  onSources: (sources: SourceResult[]) => void
  onCitation: (citation: CitationResult) => void
  onNotice: (notice: SearchNotice) => void
  onDone: () => void
  onError: (error: string) => void
}

interface EmbedDep {
  embed(texts: string[]): Promise<Float32Array[]>
}

interface RetrieveDep {
  keywordSearch(queryText: string, maxResults?: number): StoredChunkRow[]
  hybridSearch(
    queryText: string,
    queryVec: Float32Array,
    k: number,
    maxResults?: number
  ): StoredChunkRow[]
}

interface SettingsDep {
  load(): {
    cloudAnswersEnabled: boolean
    firstCloudUseAcknowledgedAt: string | null
    answerProvider: AnswerProviderId
    answerModel: AnswerModelId
  }
  getSecret(provider: ProviderId): string | null
}

const RETRIEVE_K = 20
const RETRIEVE_MAX = 15
const CITATION_RE = /\[(\d+)\]/g

function providerLabel(provider: AnswerProviderId): string {
  return provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
}

export class SearchService {
  private readonly cancelled = new Set<string>()

  constructor(
    private readonly embedDep: EmbedDep,
    private readonly retrieveDep: RetrieveDep,
    private readonly settings: SettingsDep
  ) {}

  async search(query: string, requestId: string, callbacks: SearchCallbacks): Promise<void> {
    try {
      if (this.cancelled.has(requestId)) return

      let rows: StoredChunkRow[]
      try {
        const [queryVec] = await this.embedDep.embed([query])

        if (this.cancelled.has(requestId)) return

        rows = this.retrieveDep.hybridSearch(query, queryVec, RETRIEVE_K, RETRIEVE_MAX)
      } catch {
        if (this.cancelled.has(requestId)) return
        rows = this.retrieveDep.keywordSearch(query, RETRIEVE_MAX)
      }

      const chunks: SearchChunk[] = rows.map((r, i) => ({
        index: i + 1,
        sourcePath: r.sourcePath,
        headingPath: r.headingPath,
        text: r.text
      }))

      callbacks.onSources(
        chunks.map((c) => ({ sourcePath: c.sourcePath, headingPath: c.headingPath }))
      )

      if (chunks.length === 0) {
        callbacks.onNotice({
          code: 'no-local-sources',
          message: 'No local sources found. Try a different query or rebuild the local index.'
        })
        callbacks.onDone()
        return
      }

      const settings = this.settings.load()
      if (!settings.cloudAnswersEnabled) {
        callbacks.onNotice({
          code: 'cloud-answers-disabled',
          message: 'Cloud answer skipped because Cloud Answers are disabled in Settings.'
        })
        callbacks.onDone()
        return
      }

      if (!settings.firstCloudUseAcknowledgedAt) {
        callbacks.onNotice({
          code: 'cloud-answers-not-acknowledged',
          message: 'Cloud answer skipped until the first-use warning is accepted.'
        })
        callbacks.onDone()
        return
      }

      const provider = settings.answerProvider
      const model = settings.answerModel
      const apiKey = this.settings.getSecret(provider)
      if (!apiKey) {
        callbacks.onNotice({
          code: 'provider-key-missing',
          message: `Cloud answer skipped because no ${providerLabel(provider)} API key is saved for ${model}.`
        })
        callbacks.onDone()
        return
      }

      const llm: LLMProvider =
        provider === 'anthropic'
          ? new AnthropicProvider(apiKey, model)
          : new OpenAIProvider(apiKey, model)

      if (this.cancelled.has(requestId)) return

      let answer = ''
      try {
        await llm.synthesize(query, chunks, (token) => {
          if (this.cancelled.has(requestId)) return
          answer += token
          callbacks.onToken(token)
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`${providerLabel(provider)} ${model} answer failed: ${message}`)
      }

      if (this.cancelled.has(requestId)) return

      const cited = new Set<number>()
      for (const match of answer.matchAll(CITATION_RE)) {
        const idx = parseInt(match[1], 10)
        if (!cited.has(idx) && chunks[idx - 1]) {
          cited.add(idx)
          const c = chunks[idx - 1]
          callbacks.onCitation({ index: idx, sourcePath: c.sourcePath, headingPath: c.headingPath })
        }
      }

      callbacks.onDone()
    } catch (err) {
      if (!this.cancelled.has(requestId)) {
        callbacks.onError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      this.cancelled.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    this.cancelled.add(requestId)
  }
}
