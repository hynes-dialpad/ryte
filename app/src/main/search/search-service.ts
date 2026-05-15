import { AnthropicProvider } from './anthropic-provider'
import { type LLMProvider, type SearchChunk } from './llm-provider'
import { OpenAIProvider } from './openai-provider'
import { type StoredChunkRow } from '../indexing/vector-store'
import { modelProvider, type ModelId, type ProviderId } from '../settings/settings-store'

export interface CitationResult {
  index: number
  sourcePath: string
  headingPath: string[]
}

export interface SourceResult {
  sourcePath: string
  headingPath: string[]
}

export interface SearchCallbacks {
  onToken: (token: string) => void
  onSources: (sources: SourceResult[]) => void
  onCitation: (citation: CitationResult) => void
  onDone: () => void
  onError: (error: string) => void
}

interface EmbedDep {
  embed(texts: string[]): Promise<Float32Array[]>
}

interface RetrieveDep {
  hybridSearch(
    queryText: string,
    queryVec: Float32Array,
    k: number,
    maxResults?: number
  ): StoredChunkRow[]
}

interface SettingsDep {
  load(): { model: ModelId }
  getSecret(provider: ProviderId): string | null
}

const RETRIEVE_K = 20
const RETRIEVE_MAX = 15
const CITATION_RE = /\[(\d+)\]/g

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

      const [queryVec] = await this.embedDep.embed([query])

      if (this.cancelled.has(requestId)) return

      const rows = this.retrieveDep.hybridSearch(query, queryVec, RETRIEVE_K, RETRIEVE_MAX)
      const chunks: SearchChunk[] = rows.map((r, i) => ({
        index: i + 1,
        sourcePath: r.sourcePath,
        headingPath: r.headingPath,
        text: r.text
      }))

      callbacks.onSources(
        chunks.map((c) => ({ sourcePath: c.sourcePath, headingPath: c.headingPath }))
      )

      const { model } = this.settings.load()
      const provider = modelProvider(model)
      const apiKey = this.settings.getSecret(provider)
      if (!apiKey) throw new Error(`No ${provider} API key configured`)

      const llm: LLMProvider =
        provider === 'anthropic'
          ? new AnthropicProvider(apiKey, model)
          : new OpenAIProvider(apiKey, model)

      if (this.cancelled.has(requestId)) return

      let answer = ''
      await llm.synthesize(query, chunks, (token) => {
        if (this.cancelled.has(requestId)) return
        answer += token
        callbacks.onToken(token)
      })

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
