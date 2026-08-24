import type { ModelId } from '../settings/settings-store'

export interface SearchChunk {
  index: number // 1-based, matches [N] in answer
  sourcePath: string // relative to notesRoot
  headingPath: string[]
  text: string
}

export interface LLMProvider {
  synthesize(
    query: string,
    chunks: SearchChunk[],
    onToken: (token: string) => void,
    options?: { signal?: AbortSignal }
  ): Promise<void>
}

export function buildSynthesisMessages(
  query: string,
  chunks: SearchChunk[]
): { system: string; userContent: string } {
  const system = [
    'You are a personal knowledge assistant. Answer using ONLY the numbered source chunks provided.',
    'Begin with a direct answer in plain prose (2-3 sentences).',
    'When distinct topics would improve scanning, use short Markdown ## headings or bold lead-ins.',
    'Do not use numbered lists for the answer. Use bullets only when they improve clarity.',
    'A "Sources" section is NOT needed — cite each factual claim inline as [N].',
    "If the chunks don't contain enough information, say so briefly.",
    'Cite every factual claim with [N]. Be thorough but organized.'
  ].join(' ')

  const chunkList = chunks
    .map(({ index, sourcePath, headingPath, text }) => {
      const loc = headingPath.length > 0 ? `${sourcePath} > ${headingPath.join(' > ')}` : sourcePath
      return `[${index}] ${loc}\n\n${text}`
    })
    .join('\n\n---\n\n')

  return { system, userContent: `Sources:\n\n${chunkList}\n\nQuestion: ${query}` }
}

export type { ModelId }
