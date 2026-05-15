<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useIndexStatusStore } from '../stores/index-status'
import { useSettingsStore } from '../stores/settings'
import type { ModelId } from '../../../main/settings/settings-store'

const props = defineProps<{ dismissable: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const indexStatus = useIndexStatusStore()

const selectedModel = ref<ModelId>('claude-haiku-4-5')
const synthesisKey = ref('') // Anthropic key for Claude; OpenAI key for GPT (covers both synthesis + embeddings)
const embeddingsKey = ref('') // OpenAI key — only needed when Claude model is selected
const notesRoot = ref('')
const saving = ref(false)
const localError = ref<string | null>(null)

const MODELS: { id: ModelId; label: string; provider: 'anthropic' | 'openai' }[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'anthropic' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' }
]

const isOpenAIModel = computed(() => selectedModel.value.startsWith('gpt-'))

const synthesisKeyLabel = computed(() => {
  const provider = isOpenAIModel.value ? 'OpenAI' : 'Anthropic'
  const hasKey = isOpenAIModel.value
    ? (settings.state?.hasOpenAIKey ?? false)
    : (settings.state?.hasAnthropicKey ?? false)
  const base = `${provider} API key`
  return hasKey ? `${base} (•••••• set — type to replace)` : base
})

const embeddingsKeyLabel = computed(() => {
  const hasKey = settings.state?.hasOpenAIKey ?? false
  return hasKey
    ? 'OpenAI API key for embeddings (•••••• set — type to replace)'
    : 'OpenAI API key for embeddings'
})

const keychainOK = computed(() => settings.state?.keychainAvailable ?? false)

const canSave = computed(() => {
  if (saving.value || !keychainOK.value) return false
  const s = settings.state
  if (!s) return false
  if (!notesRoot.value.trim()) return false

  if (isOpenAIModel.value) {
    // OpenAI model: one key covers both synthesis and embeddings
    return s.hasOpenAIKey || !!synthesisKey.value.trim()
  } else {
    // Claude model: embeddings key (OpenAI) is always required; synthesis key (Anthropic) is optional
    return s.hasOpenAIKey || !!embeddingsKey.value.trim()
  }
})

onMounted(async () => {
  if (!settings.state) await settings.hydrate()
  const s = settings.state
  if (s) {
    selectedModel.value = s.model
    notesRoot.value = s.notesRoot
  }
})

async function pickFolder(): Promise<void> {
  const picked = await window.ryte.dialog.openFolder()
  if (picked) notesRoot.value = picked
}

async function onSave(): Promise<void> {
  if (!canSave.value) return
  saving.value = true
  localError.value = null
  try {
    const patch: Parameters<typeof settings.save>[0] = {
      model: selectedModel.value,
      notesRoot: notesRoot.value.trim()
    }

    if (isOpenAIModel.value) {
      // OpenAI model: synthesisKey is the OpenAI key (used for embeddings + V2 synthesis)
      if (synthesisKey.value.trim()) patch.openaiKey = synthesisKey.value.trim()
    } else {
      // Claude model: synthesisKey → Anthropic; embeddingsKey → OpenAI
      if (synthesisKey.value.trim()) patch.anthropicKey = synthesisKey.value.trim()
      if (embeddingsKey.value.trim()) patch.openaiKey = embeddingsKey.value.trim()
    }

    await settings.save(patch)
    synthesisKey.value = ''
    embeddingsKey.value = ''
    emit('close')
    void indexStatus.triggerReindex()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function onBackdropClick(): void {
  if (props.dismissable) emit('close')
}
</script>

<template>
  <div class="modal-backdrop" @click.self="onBackdropClick">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">Settings</h2>
      </header>

      <p v-if="!keychainOK" class="error-banner">
        macOS Keychain unavailable — please unlock your Keychain and restart ryte.
      </p>

      <form @submit.prevent="onSave">
        <!-- Model first -->
        <label>
          <span>Model</span>
          <select v-model="selectedModel" :disabled="saving">
            <optgroup label="Anthropic">
              <option
                v-for="m in MODELS.filter((m) => m.provider === 'anthropic')"
                :key="m.id"
                :value="m.id"
              >
                {{ m.label }}
              </option>
            </optgroup>
            <optgroup label="OpenAI">
              <option
                v-for="m in MODELS.filter((m) => m.provider === 'openai')"
                :key="m.id"
                :value="m.id"
              >
                {{ m.label }}
              </option>
            </optgroup>
          </select>
        </label>

        <!-- Primary API key (adapts to selected provider) -->
        <label>
          <span>{{ synthesisKeyLabel }}</span>
          <input
            v-model="synthesisKey"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :disabled="!keychainOK || saving"
          />
        </label>

        <!-- OpenAI embeddings key — only when Claude model selected -->
        <label v-if="!isOpenAIModel">
          <span>{{ embeddingsKeyLabel }} <span class="hint">(required for indexing)</span></span>
          <input
            v-model="embeddingsKey"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :disabled="!keychainOK || saving"
          />
        </label>

        <!-- Notes root -->
        <label>
          <span>Notes root folder</span>
          <div class="folder-row">
            <input v-model="notesRoot" type="text" spellcheck="false" :disabled="saving" />
            <button type="button" :disabled="saving" @click="pickFolder">Choose…</button>
          </div>
        </label>

        <p v-if="localError" class="error-text">{{ localError }}</p>
        <p v-if="settings.error" class="error-text">{{ settings.error }}</p>

        <div class="actions">
          <button v-if="dismissable" type="button" :disabled="saving" @click="emit('close')">
            Cancel
          </button>
          <button type="submit" :disabled="!canSave">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--color-background-soft, #222);
  color: var(--color-text);
  padding: 1.5rem 1.75rem;
  border-radius: 8px;
  min-width: 420px;
  max-width: 520px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.875rem;
}

input[type='password'],
input[type='text'],
select {
  background: var(--color-background-mute, #2a2a2a);
  color: var(--color-text);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  padding: 0.5rem 0.625rem;
  font-size: 0.875rem;
  font-family: inherit;
}

input:disabled,
select:disabled,
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.folder-row {
  display: flex;
  gap: 0.5rem;
}

.folder-row input {
  flex: 1;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

button {
  background: var(--color-background-mute, #2a2a2a);
  color: var(--color-text);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 0.45rem 0.9rem;
  font-size: 0.875rem;
  cursor: pointer;
  font-family: inherit;
}

button[type='submit'] {
  background: #2d6cdf;
  border-color: #2d6cdf;
}

button[type='submit']:hover:not(:disabled) {
  background: #3b7ce9;
}

.error-banner {
  background: rgba(220, 80, 80, 0.18);
  border: 1px solid rgba(220, 80, 80, 0.4);
  color: #ffb4b4;
  padding: 0.5rem 0.625rem;
  border-radius: 4px;
  font-size: 0.825rem;
  margin: 0 0 0.5rem 0;
}

.error-text {
  color: #ff9494;
  font-size: 0.825rem;
  margin: 0;
}

.hint {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
  font-weight: normal;
}
</style>
