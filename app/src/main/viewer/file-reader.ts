import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export async function readFileSafe(absPath: string, notesRoot: string): Promise<string> {
  const resolvedRoot = await realpath(resolve(notesRoot))

  let resolvedTarget: string
  try {
    resolvedTarget = await realpath(resolve(absPath))
  } catch {
    resolvedTarget = resolve(absPath)
  }

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new Error(`path outside notes root: ${absPath}`)
  }

  return readFile(resolvedTarget, 'utf8')
}
