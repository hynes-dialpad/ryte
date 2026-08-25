<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps<{
  name: string
  label: string
  variant: 'sidebar' | 'tab'
}>()

const emit = defineEmits<{
  submit: [name: string]
  cancel: []
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const value = ref(props.name)

onMounted(() => {
  void nextTick(() => {
    const input = inputEl.value
    if (!input) return
    input.focus()
    const extensionStart = props.name.toLowerCase().endsWith('.md')
      ? props.name.length - 3
      : props.name.length
    input.setSelectionRange(0, extensionStart)
  })
})
</script>

<template>
  <input
    ref="inputEl"
    v-model="value"
    class="inline-file-rename"
    :class="variant"
    :aria-label="label"
    spellcheck="false"
    @click.stop
    @pointerdown.stop
    @contextmenu.stop
    @keydown.enter.prevent.stop="emit('submit', value.trim())"
    @keydown.escape.prevent.stop="emit('cancel')"
    @blur="emit('cancel')"
  />
</template>

<style scoped>
.inline-file-rename {
  height: 1.75rem;
  padding: 0.15rem 0.35rem;
  border: 1px solid #49a9ff;
  border-radius: 0.35rem;
  background: rgba(10, 9, 11, 0.85);
  color: #fff;
  font: inherit;
  outline: none;
  user-select: text;
}

.sidebar {
  position: relative;
  z-index: 3;
  flex: 1 1 auto;
  min-width: 0;
  margin-block: -0.25rem;
}

.tab {
  flex: 0 1 9.6rem;
  min-width: 5rem;
  font-size: 0.76rem;
}
</style>
