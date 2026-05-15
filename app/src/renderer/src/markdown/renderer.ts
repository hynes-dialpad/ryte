import MarkdownIt from 'markdown-it'
import Shiki from '@shikijs/markdown-it'

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/

let mdPromise: Promise<MarkdownIt> | null = null

async function getMd(): Promise<MarkdownIt> {
  if (!mdPromise) {
    mdPromise = (async () => {
      const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
      md.use(
        await Shiki({
          themes: { light: 'github-dark', dark: 'github-dark' },
          fallbackLanguage: 'md'
        })
      )
      return md
    })()
  }
  return mdPromise
}

export async function render(text: string): Promise<string> {
  const md = await getMd()
  const stripped = text.replace(FRONTMATTER_RE, '')
  return md.render(stripped)
}
