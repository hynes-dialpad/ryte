<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { resolveContextMenuPosition, type FileContextMenuAction } from './file-context-menu-model'

const props = defineProps<{
  x: number
  y: number
  fileName: string
  canClose?: boolean
}>()

const emit = defineEmits<{
  action: [action: FileContextMenuAction]
  dismiss: []
}>()

const menuEl = ref<HTMLElement | null>(null)
const position = ref({ left: props.x, top: props.y })
const menuStyle = computed(() => ({
  left: `${position.value.left}px`,
  top: `${position.value.top}px`
}))

function menuItems(): HTMLButtonElement[] {
  return [...(menuEl.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
}

async function positionAndFocus(): Promise<void> {
  await nextTick()
  const menu = menuEl.value
  if (!menu) return
  const rect = menu.getBoundingClientRect()
  position.value = resolveContextMenuPosition({
    pointerX: props.x,
    pointerY: props.y,
    menuWidth: rect.width,
    menuHeight: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    margin: 8
  })
  menuItems()[0]?.focus()
}

function selectAction(action: FileContextMenuAction): void {
  emit('action', action)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && menuEl.value?.contains(target)) return
  emit('dismiss')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    emit('dismiss')
    return
  }

  const items = menuItems()
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  let nextIndex: number | null = null
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = items.length - 1
  if (nextIndex === null) return
  event.preventDefault()
  items[nextIndex]?.focus()
}

watch(() => [props.x, props.y] as const, positionAndFocus)

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  void positionAndFocus()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuEl"
      class="file-context-menu"
      role="menu"
      :aria-label="`File actions for ${fileName}`"
      :style="menuStyle"
      @contextmenu.prevent
      @keydown="onKeydown"
    >
      <button type="button" role="menuitem" @click="selectAction('copy-file')">Copy file</button>
      <button type="button" role="menuitem" @click="selectAction('rename')">Rename</button>
      <div class="menu-separator" role="separator" />
      <button type="button" role="menuitem" @click="selectAction('show-in-finder')">
        Show in Finder
      </button>
      <button type="button" role="menuitem" @click="selectAction('copy-file-path')">
        Copy file path
      </button>
      <template v-if="canClose">
        <div class="menu-separator" role="separator" />
        <button type="button" role="menuitem" @click="selectAction('close')">Close</button>
      </template>
      <div class="menu-separator" role="separator" />
      <button
        type="button"
        class="destructive"
        role="menuitem"
        @click="selectAction('move-to-trash')"
      >
        Move to Trash
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.file-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 12rem;
  padding: 0.25rem;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 0.5rem;
  background: #fff;
  box-shadow:
    0 1.25rem 3rem rgba(0, 0, 0, 0.22),
    0 0.25rem 1rem rgba(0, 0, 0, 0.14);
  color: #111;
  font: inherit;
  -webkit-app-region: no-drag;
}

button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 2rem;
  padding: 0.25rem 0.625rem;
  border: 0;
  border-radius: 0.3125rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
}

button:hover,
button:focus-visible {
  background: rgba(0, 0, 0, 0.07);
  outline: none;
}

button.destructive {
  color: #b42318;
}

button.destructive:hover,
button.destructive:focus-visible {
  background: #fff0ee;
}

.menu-separator {
  height: 1px;
  margin: 0.1875rem 0.5rem;
  background: rgba(0, 0, 0, 0.12);
}
</style>
