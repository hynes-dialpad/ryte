import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useViewerStore = defineStore('viewer', () => {
  const tree = ref<string[]>([])
  const notesRoot = ref<string | null>(null)
  const selectedPath = ref<string | null>(null)
  const content = ref<string>('')
  const sourceMode = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  async function hydrate(): Promise<void> {
    const { notesRoot: root, paths } = await window.ryte.files.listTree()
    notesRoot.value = root
    tree.value = paths

    if (unsubscribe) {
      unsubscribe()
    }
    unsubscribe = window.ryte.files.onChange(async (path) => {
      if (path === selectedPath.value) {
        try {
          content.value = await window.ryte.files.read(path)
          error.value = null
        } catch (e) {
          error.value = e instanceof Error ? e.message : String(e)
        }
      }
    })
  }

  async function openFile(absPath: string): Promise<void> {
    selectedPath.value = absPath
    error.value = null
    try {
      content.value = await window.ryte.files.read(absPath)
      await window.ryte.files.watch(absPath)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      content.value = ''
    }
  }

  async function closeFile(): Promise<void> {
    await window.ryte.files.unwatch()
    selectedPath.value = null
    content.value = ''
    error.value = null
  }

  function toggleSourceMode(): void {
    sourceMode.value = !sourceMode.value
  }

  return {
    tree,
    notesRoot,
    selectedPath,
    content,
    sourceMode,
    error,
    hydrate,
    openFile,
    closeFile,
    toggleSourceMode
  }
})
