import { describe, expect, it } from 'vitest'

import { render } from './renderer'

describe('render', () => {
  it('should render a heading and paragraph', async () => {
    const html = await render('# Hello\n\nWorld')
    expect(html).toContain('<h1>Hello</h1>')
    expect(html).toContain('<p>World</p>')
  })

  it('should syntax-highlight fenced code blocks', async () => {
    const html = await render('```ts\nconst x: number = 1\n```')
    // Shiki wraps code in <pre class="shiki ..."><code>...</code></pre>
    // with span elements carrying inline color styles for each token.
    expect(html).toContain('shiki')
    expect(html).toMatch(/<span style="color:/)
  })

  it('should strip YAML frontmatter before rendering', async () => {
    const html = await render('---\nfoo: bar\n---\n# H')
    expect(html).toContain('<h1>H</h1>')
    expect(html).not.toContain('foo: bar')
  })

  it('should leave content without frontmatter untouched', async () => {
    const html = await render('---\n\nnot frontmatter')
    // A standalone `---` followed by a paragraph is a horizontal rule per CommonMark.
    expect(html).toContain('<hr>')
    expect(html).toContain('<p>not frontmatter</p>')
  })

  it('should fall back gracefully on unknown code-block languages', async () => {
    const html = await render('```madeuplang\nfoo bar\n```')
    expect(html).toContain('foo bar')
  })

  it('should linkify URLs', async () => {
    const html = await render('See https://example.com')
    expect(html).toContain('<a href="https://example.com"')
  })
})
