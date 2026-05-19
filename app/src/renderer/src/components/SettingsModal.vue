<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useIndexStatusStore } from '../stores/index-status'
import { useSettingsStore } from '../stores/settings'
import type {
  AnswerModelId,
  AnswerProviderId,
  ProviderId
} from '../../../main/settings/settings-store'

const props = defineProps<{ dismissable: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const indexStatus = useIndexStatusStore()

const notesRoot = ref('')
const cloudAnswersEnabled = ref(false)
const semanticIndexEnabled = ref(false)
const answerProvider = ref<AnswerProviderId>('openai')
const answerModel = ref<AnswerModelId>('gpt-5.2')
const openaiKey = ref('')
const anthropicKey = ref('')
const saving = ref(false)
const localError = ref<string | null>(null)
const appVersion = ref('')

const ANSWER_MODELS: Array<{
  id: AnswerModelId
  label: string
  provider: AnswerProviderId
}> = [
  { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'openai' },
  { id: 'gpt-5.1', label: 'GPT-5.1', provider: 'openai' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'anthropic' }
]

const answerModelsForProvider = computed(() =>
  ANSWER_MODELS.filter((model) => model.provider === answerProvider.value)
)

const keychainOK = computed(() => settings.state?.keychainAvailable ?? false)

const providerKeyStatus = computed<Record<ProviderId, boolean>>(() => ({
  openai: settings.state?.hasOpenAIKey ?? false,
  anthropic: settings.state?.hasAnthropicKey ?? false,
  gemini: settings.state?.hasGeminiKey ?? false
}))

const selectedAnswerProviderHasKey = computed(() => providerKeyStatus.value[answerProvider.value])

const openaiKeyLabel = computed(() =>
  providerKeyStatus.value.openai ? 'OpenAI API key (set - type to replace)' : 'OpenAI API key'
)

const anthropicKeyLabel = computed(() =>
  providerKeyStatus.value.anthropic
    ? 'Anthropic API key (set - type to replace)'
    : 'Anthropic API key'
)

const canSave = computed(() => {
  if (saving.value) return false
  if (!settings.state) return false
  if (!notesRoot.value.trim()) return false
  if (!keychainOK.value && (openaiKey.value.trim() || anthropicKey.value.trim())) return false
  return true
})

watch(answerProvider, () => {
  const selectedStillValid = answerModelsForProvider.value.some(
    (model) => model.id === answerModel.value
  )
  if (!selectedStillValid) {
    answerModel.value = answerModelsForProvider.value[0]?.id ?? 'gpt-5.2'
  }
})

onMounted(async () => {
  const versionPromise = window.ryte.app.getVersion()
  if (!settings.state) await settings.hydrate()
  const s = settings.state
  if (s) {
    notesRoot.value = s.notesRoot
    cloudAnswersEnabled.value = s.cloudAnswersEnabled
    semanticIndexEnabled.value = s.semanticIndexEnabled
    answerProvider.value = s.answerProvider
    answerModel.value = s.answerModel
  }
  appVersion.value = await versionPromise
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
      notesRoot: notesRoot.value.trim(),
      cloudAnswersEnabled: cloudAnswersEnabled.value,
      semanticIndexEnabled: semanticIndexEnabled.value,
      answerProvider: answerProvider.value,
      answerModel: answerModel.value,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small'
    }

    if (openaiKey.value.trim()) patch.openaiKey = openaiKey.value.trim()
    if (anthropicKey.value.trim()) patch.anthropicKey = anthropicKey.value.trim()

    await settings.save(patch)
    openaiKey.value = ''
    anthropicKey.value = ''
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
        macOS Keychain unavailable. Unlock Keychain and restart Ryte before saving API keys.
      </p>

      <form @submit.prevent="onSave">
        <section class="settings-section" aria-labelledby="local-folder-title">
          <h3 id="local-folder-title">Local Folder</h3>
          <label>
            <span>Notes root folder</span>
            <div class="folder-row">
              <input v-model="notesRoot" type="text" spellcheck="false" :disabled="saving" />
              <button type="button" :disabled="saving" @click="pickFolder">Choose...</button>
            </div>
          </label>
        </section>

        <section class="settings-section" aria-labelledby="local-search-title">
          <h3 id="local-search-title">Local Search</h3>
          <div class="static-row">
            <span>Keyword search</span>
            <strong>On</strong>
          </div>
        </section>

        <section class="settings-section" aria-labelledby="semantic-index-title">
          <h3 id="semantic-index-title">Semantic Index</h3>
          <label class="check-row">
            <input v-model="semanticIndexEnabled" type="checkbox" :disabled="saving" />
            <span>Enable OpenAI embeddings</span>
          </label>
          <p v-if="semanticIndexEnabled" class="warning-copy">
            Semantic indexing sends note chunks to OpenAI to create embeddings. Leave this off for
            keyword-only local search.
          </p>
          <div class="static-row">
            <span>Embedding model</span>
            <strong>text-embedding-3-small</strong>
          </div>
        </section>

        <section class="settings-section" aria-labelledby="cloud-answers-title">
          <h3 id="cloud-answers-title">Cloud Answers</h3>
          <label class="check-row">
            <input v-model="cloudAnswersEnabled" type="checkbox" :disabled="saving" />
            <span>Enable generated answers</span>
          </label>
          <p v-if="cloudAnswersEnabled" class="warning-copy">
            Cloud answers send your search query and selected note excerpts to the selected model
            provider. Your full notes folder is not uploaded.
          </p>
          <div class="split-row">
            <label>
              <span>Answer provider</span>
              <select v-model="answerProvider" :disabled="saving">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label>
              <span>Answer model</span>
              <select v-model="answerModel" :disabled="saving">
                <option v-for="model in answerModelsForProvider" :key="model.id" :value="model.id">
                  {{ model.label }}
                </option>
              </select>
            </label>
          </div>
          <p v-if="cloudAnswersEnabled && !selectedAnswerProviderHasKey" class="hint-text">
            Add a {{ answerProvider === 'openai' ? 'OpenAI' : 'Anthropic' }} API key before cloud
            answers can run.
          </p>
        </section>

        <section class="settings-section" aria-labelledby="provider-keys-title">
          <h3 id="provider-keys-title">Provider Keys</h3>
          <label>
            <span>{{ openaiKeyLabel }}</span>
            <input
              v-model="openaiKey"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :disabled="!keychainOK || saving"
            />
          </label>
          <label>
            <span>{{ anthropicKeyLabel }}</span>
            <input
              v-model="anthropicKey"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :disabled="!keychainOK || saving"
            />
          </label>
        </section>

        <p v-if="localError" class="error-text">{{ localError }}</p>
        <p v-if="settings.error" class="error-text">{{ settings.error }}</p>

        <div class="actions">
          <button v-if="dismissable" type="button" :disabled="saving" @click="emit('close')">
            Cancel
          </button>
          <button type="submit" :disabled="!canSave">
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>

      <footer class="settings-footer">Ryte {{ appVersion }}</footer>
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
  padding: 1.5rem;
}

.modal {
  background: var(--color-background-soft, #222);
  color: var(--color-text);
  padding: 1.5rem 1.75rem;
  border-radius: 8px;
  width: min(640px, 100%);
  max-height: min(860px, 92vh);
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

h3 {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ev-c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

form,
.settings-section {
  display: flex;
  flex-direction: column;
}

form {
  gap: 1rem;
}

.settings-section {
  gap: 0.65rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.875rem;
}

.check-row {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.check-row input {
  width: 1rem;
  height: 1rem;
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

.folder-row,
.split-row,
.static-row {
  display: flex;
  gap: 0.5rem;
}

.folder-row input,
.split-row label {
  flex: 1;
}

.static-row {
  align-items: center;
  justify-content: space-between;
  color: var(--ev-c-text-2);
  font-size: 0.875rem;
}

.static-row strong {
  color: var(--ev-c-text-1);
  font-weight: 500;
}

.warning-copy,
.hint-text {
  font-size: 0.8rem;
  line-height: 1.45;
  margin: 0;
}

.warning-copy {
  color: #ffd7a3;
}

.hint-text {
  color: var(--ev-c-text-3);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
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

.settings-footer {
  color: var(--ev-c-text-3);
  font-size: 0.75rem;
  margin-top: 1rem;
  text-align: right;
}

@media (max-width: 560px) {
  .split-row {
    flex-direction: column;
  }
}
</style>
