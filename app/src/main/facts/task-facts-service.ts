import { readFile, stat } from 'node:fs/promises'
import { relative, sep } from 'node:path'

import type { MarkdownTaskFact, TaskFactsResponse, TaskListInput } from '../../shared/tasks'
import { walkNotes } from '../indexing/walker'
import { extractMarkdownTaskFacts } from './task-extractor'

const TASK_FACTS_CONCURRENCY = 16
const DEFAULT_TASK_LIMIT = 50
const MAX_TASK_LIMIT = 200

interface TaskFactsSnapshot {
  notesRoot: string
  tasks: MarkdownTaskFact[]
  refreshedAt: string
}

function sourcePathFor(notesRoot: string, absolutePath: string): string {
  return relative(notesRoot, absolutePath).split(sep).join('/')
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index] as T)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function compareTasks(left: MarkdownTaskFact, right: MarkdownTaskFact): number {
  const leftMtime = left.sourceMtimeMs ?? 0
  const rightMtime = right.sourceMtimeMs ?? 0
  if (leftMtime !== rightMtime) return rightMtime - leftMtime
  if (left.sourcePath !== right.sourcePath) return left.sourcePath.localeCompare(right.sourcePath)
  return left.line - right.line
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_TASK_LIMIT
  return Math.max(0, Math.min(MAX_TASK_LIMIT, Math.floor(limit)))
}

export class TaskFactsService {
  private snapshot: TaskFactsSnapshot | null = null
  private stale = true
  private refreshPromise: Promise<TaskFactsSnapshot> | null = null

  markStale(): void {
    this.stale = true
  }

  async refresh(notesRoot: string): Promise<TaskFactsSnapshot> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = this.buildSnapshot(notesRoot)
      .then((snapshot) => {
        this.snapshot = snapshot
        this.stale = false
        return snapshot
      })
      .finally(() => {
        this.refreshPromise = null
      })

    return this.refreshPromise
  }

  async list(notesRoot: string, input: TaskListInput = {}): Promise<TaskFactsResponse> {
    if (!this.snapshot || this.snapshot.notesRoot !== notesRoot || this.stale) {
      await this.refresh(notesRoot)
    }

    const snapshot = this.snapshot
    if (!snapshot) {
      return { notesRoot, tasks: [], refreshedAt: new Date(0).toISOString() }
    }

    const limit = normalizeLimit(input.limit)
    const tasks = snapshot.tasks
      .filter((task) => input.checked === undefined || task.checked === input.checked)
      .slice(0, limit)

    return {
      notesRoot: snapshot.notesRoot,
      tasks,
      refreshedAt: snapshot.refreshedAt
    }
  }

  private async buildSnapshot(notesRoot: string): Promise<TaskFactsSnapshot> {
    const absolutePaths = await walkNotes(notesRoot)
    const extractedAt = new Date().toISOString()
    const taskLists = await mapWithConcurrency(
      absolutePaths,
      TASK_FACTS_CONCURRENCY,
      async (absolutePath) => {
        const [metadata, markdown] = await Promise.all([
          stat(absolutePath),
          readFile(absolutePath, 'utf-8')
        ])
        return extractMarkdownTaskFacts({
          markdown,
          sourcePath: sourcePathFor(notesRoot, absolutePath),
          sourceMtimeMs: metadata.mtimeMs,
          extractedAt
        })
      }
    )

    return {
      notesRoot,
      tasks: taskLists.flat().sort(compareTasks),
      refreshedAt: extractedAt
    }
  }
}

export const taskFactsService = new TaskFactsService()
