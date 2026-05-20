import OpenAI from 'openai'

import { buildSynthesisMessages, type LLMProvider, type SearchChunk } from './llm-provider'
import type { ModelId } from '../settings/settings-store'

const MAX_OUTPUT_TOKENS = 1024

function completionTokenLimit(
  model: string
): { max_completion_tokens: number } | { max_tokens: number } {
  return model.startsWith('gpt-5')
    ? { max_completion_tokens: MAX_OUTPUT_TOKENS }
    : { max_tokens: MAX_OUTPUT_TOKENS }
}

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly model: string

  constructor(apiKey: string, model: ModelId) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: false })
    this.model = model
  }

  async synthesize(
    query: string,
    chunks: SearchChunk[],
    onToken: (token: string) => void,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    const { system, userContent } = buildSynthesisMessages(query, chunks)
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        ...completionTokenLimit(this.model),
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent }
        ]
      },
      { signal: options.signal }
    )
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) onToken(content)
    }
  }
}
