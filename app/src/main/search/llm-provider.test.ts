import { describe, expect, it } from 'vitest'

import { buildSynthesisMessages, type SearchChunk } from './llm-provider'

function chunk(
  index: number,
  sourcePath: string,
  headingPath: string[],
  text: string
): SearchChunk {
  return { index, sourcePath, headingPath, text }
}

describe('buildSynthesisMessages', () => {
  it('includes the query in the user content', () => {
    const { userContent } = buildSynthesisMessages('what is X?', [
      chunk(1, 'a.md', [], 'chunk text')
    ])
    expect(userContent).toContain('what is X?')
  })

  it('numbers chunks using their index field', () => {
    const { userContent } = buildSynthesisMessages('q', [
      chunk(1, 'a.md', [], 'first'),
      chunk(2, 'b.md', [], 'second')
    ])
    expect(userContent).toContain('[1]')
    expect(userContent).toContain('[2]')
  })

  it('includes sourcePath in user content', () => {
    const { userContent } = buildSynthesisMessages('q', [chunk(1, 'sessions/foo.md', [], 'body')])
    expect(userContent).toContain('sessions/foo.md')
  })

  it('appends heading breadcrumb when headingPath is non-empty', () => {
    const { userContent } = buildSynthesisMessages('q', [
      chunk(1, 'a.md', ['Meetings', 'Marshall 1:1'], 'body')
    ])
    expect(userContent).toContain('Meetings > Marshall 1:1')
  })

  it('omits breadcrumb separator when headingPath is empty', () => {
    const { userContent } = buildSynthesisMessages('q', [chunk(1, 'a.md', [], 'body')])
    expect(userContent).not.toContain(' > ')
  })

  it('system prompt instructs inline citation style', () => {
    const { system } = buildSynthesisMessages('q', [chunk(1, 'a.md', [], 'body')])
    expect(system).toMatch(/\[N\]/i)
    expect(system).toMatch(/cite/i)
  })
})
