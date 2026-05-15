import type { ModelId } from '../settings/settings-store'

export interface SearchChunk {
  index: number // 1-based, matches [N] in answer
  sourcePath: string // relative to notesRoot
  headingPath: string[]
  text: string
}

export interface LLMProvider {
  synthesize(query: string, chunks: SearchChunk[], onToken: (token: string) => void): Promise<void>
}

export function buildSynthesisMessages(
  query: string,
  chunks: SearchChunk[]
): { system: string; userContent: string } {
  const system = [
    'You are a personal knowledge assistant. Answer using ONLY the numbered source chunks provided.',
    'Structure your response as:',
    '1. A direct answer (2-3 sentences).',
    '2. Key findings as bullet points, each citing sources inline as [N].',
    '3. A "Sources" section is NOT needed — citations in the text are sufficient.',
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
