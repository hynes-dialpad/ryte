import OpenAI from 'openai'

import { buildSynthesisMessages, type LLMProvider, type SearchChunk } from './llm-provider'
import type { ModelId } from '../settings/settings-store'

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
    onToken: (token: string) => void
  ): Promise<void> {
    const { system, userContent } = buildSynthesisMessages(query, chunks)
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ]
    })
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) onToken(content)
    }
  }
}
