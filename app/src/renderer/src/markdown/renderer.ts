import MarkdownIt from 'markdown-it'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighter, createJavaScriptRegexEngine } from 'shiki'

import { isSafeLinkTarget, sanitizeRenderedHtml } from './sanitizer'

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/

// Languages that are pre-loaded at init so they're available synchronously
// for the markdown-it highlight callback. All are JS grammar files — no WASM.
const PRELOAD_LANGS = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'bash',
  'sh',
  'zsh',
  'json',
  'jsonc',
  'yaml',
  'markdown',
  'html',
  'css',
  'vue',
  'sql',
  'rust',
  'go'
] as const

let mdPromise: Promise<MarkdownIt> | null = null

async function getMd(): Promise<MarkdownIt> {
  if (!mdPromise) {
    mdPromise = (async () => {
      const highlighter = await createHighlighter({
        themes: ['github-dark'],
        langs: [...PRELOAD_LANGS],
        // Use the pure-JS regex engine — avoids the WebAssembly/CSP restriction
        // in Electron's renderer where script-src 'self' blocks WASM execution.
        engine: createJavaScriptRegexEngine()
      })
      const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
      md.validateLink = isSafeLinkTarget
      const defaultLinkOpen =
        md.renderer.rules.link_open ??
        ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        token.attrSet('target', '_blank')
        token.attrSet('rel', 'noreferrer noopener')
        return defaultLinkOpen(tokens, idx, options, env, self)
      }
      md.use(
        fromHighlighter(highlighter, {
          theme: 'github-dark',
          // 'markdown' is always in the preload list; unknown langs fall back to it.
          fallbackLanguage: 'markdown'
        })
      )
      return md
    })().catch((err) => {
      // Reset so the next render attempt retries rather than caching a rejected promise.
      mdPromise = null
      throw err
    })
  }
  return mdPromise
}

export async function render(text: string): Promise<string> {
  const md = await getMd()
  const stripped = text.replace(FRONTMATTER_RE, '')
  return sanitizeRenderedHtml(md.render(stripped))
}
