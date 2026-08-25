import mermaid from 'mermaid'
import { describe, expect, it, vi } from 'vitest'

import { renderMermaidDiagrams } from './mermaid'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn()
  }
}))

function createMermaidNode(source: string): HTMLElement {
  const attributes = new Map<string, string>()
  return {
    textContent: source,
    innerHTML: source,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name)
  } as unknown as HTMLElement
}

function createRoot(nodes: HTMLElement[]): HTMLElement {
  return {
    querySelectorAll: vi.fn(() => nodes),
    contains: vi.fn((node: HTMLElement) => nodes.includes(node))
  } as unknown as HTMLElement
}

describe('renderMermaidDiagrams', () => {
  it('should initialize Mermaid and render pending diagram nodes', async () => {
    const bindFunctions = vi.fn()
    vi.mocked(mermaid.render).mockResolvedValue({
      diagramType: 'flowchart-v2',
      svg: '<svg role="img"></svg>',
      bindFunctions
    })
    const node = createMermaidNode('graph TD\n  A --> B')

    await renderMermaidDiagrams(createRoot([node]))

    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark'
      })
    )
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^ryte-mermaid-\d+$/),
      'graph TD\n  A --> B',
      node
    )
    expect(node.innerHTML).toBe('<svg role="img"></svg>')
    expect(bindFunctions).toHaveBeenCalledWith(node)
  })
})
