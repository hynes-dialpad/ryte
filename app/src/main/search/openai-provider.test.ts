import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } }
  }))
}))

import { OpenAIProvider } from './openai-provider'
import type { SearchChunk } from './llm-provider'

function fakeChunk(index: number, text: string): SearchChunk {
  return { index, sourcePath: 'a.md', headingPath: [], text }
}

function makeStream(tokens: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const content of tokens) {
        yield { choices: [{ delta: { content } }] }
      }
      yield { choices: [{ delta: {} }] }
    }
  }
}

describe('OpenAIProvider', () => {
  beforeEach(() => mockCreate.mockReset())

  it('calls onToken for each streamed content delta', async () => {
    mockCreate.mockResolvedValue(makeStream(['Hi', ' there']))
    const provider = new OpenAIProvider('sk-test', 'gpt-4o-mini')
    const tokens: string[] = []
    await provider.synthesize('test query', [fakeChunk(1, 'body')], (t) => tokens.push(t))
    expect(tokens).toEqual(['Hi', ' there'])
  })

  it('passes system message and user content to chat.completions.create', async () => {
    mockCreate.mockResolvedValue(makeStream([]))
    const provider = new OpenAIProvider('sk-test', 'gpt-4o-mini')
    await provider.synthesize('my question', [fakeChunk(1, 'source text')], () => {})
    expect(mockCreate).toHaveBeenCalledOnce()
    const args = mockCreate.mock.calls[0][0] as Record<string, unknown>
    expect(args.stream).toBe(true)
    const messages = args.messages as Array<{ role: string; content: string }>
    const system = messages.find((m) => m.role === 'system')
    const user = messages.find((m) => m.role === 'user')
    expect(system?.content).toBeTruthy()
    expect(user?.content).toContain('my question')
    expect(user?.content).toContain('source text')
  })

  it('skips delta events with no content', async () => {
    mockCreate.mockResolvedValue(makeStream(['real']))
    const provider = new OpenAIProvider('sk-test', 'gpt-4o-mini')
    const tokens: string[] = []
    await provider.synthesize('q', [fakeChunk(1, 'body')], (t) => tokens.push(t))
    expect(tokens).toEqual(['real'])
  })

  it('propagates errors from the stream', async () => {
    async function* failingStream() {
      yield { choices: [{ delta: { content: 'partial' } }] }
      throw new Error('network error')
    }
    mockCreate.mockResolvedValue({ [Symbol.asyncIterator]: failingStream })
    const provider = new OpenAIProvider('sk-test', 'gpt-4o-mini')
    await expect(provider.synthesize('q', [fakeChunk(1, 'body')], () => {})).rejects.toThrow(
      'network error'
    )
  })
})
