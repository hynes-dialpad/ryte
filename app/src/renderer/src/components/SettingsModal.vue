<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useIndexStatusStore } from '../stores/index-status'
import { useSearchStore } from '../stores/search'
import { useSettingsStore } from '../stores/settings'
import { answerModels } from '../../../shared/provider-registry'
import type {
  AnswerModelId,
  AnswerProviderId,
  DataFlowAcknowledgement,
  ProviderId,
  SearchHistoryRetention
} from '../../../main/settings/settings-store'

const props = defineProps<{ dismissable: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const indexStatus = useIndexStatusStore()
const search = useSearchStore()

const notesRoot = ref('')
const cloudAnswersEnabled = ref(false)
const semanticIndexEnabled = ref(false)
const answerProvider = ref<AnswerProviderId>('openai')
const answerModel = ref<AnswerModelId>('gpt-5.2')
const cloudDataAcknowledged = ref(false)
const semanticDataAcknowledged = ref(false)
const searchHistoryRetention = ref<SearchHistoryRetention>('30-days')
const searchHistoryIncludesAnswers = ref(false)
const openaiKey = ref('')
const anthropicKey = ref('')
const deletedProviderKeys = ref<Set<ProviderId>>(new Set())
const validatingProvider = ref<ProviderId | null>(null)
const keyValidationMessage = ref<Partial<Record<ProviderId, string>>>({})
const saving = ref(false)
const localError = ref<string | null>(null)
const appVersion = ref('')

const ANSWER_MODELS = answerModels()

const answerModelsForProvider = computed(() =>
  ANSWER_MODELS.filter((model) => model.providerId === answerProvider.value)
)

const keychainOK = computed(() => settings.state?.keychainAvailable ?? false)

const providerKeyStatus = computed<Record<ProviderId, boolean>>(() => ({
  openai: (settings.state?.hasOpenAIKey ?? false) && !deletedProviderKeys.value.has('openai'),
  anthropic:
    (settings.state?.hasAnthropicKey ?? false) && !deletedProviderKeys.value.has('anthropic'),
  gemini: (settings.state?.hasGeminiKey ?? false) && !deletedProviderKeys.value.has('gemini')
}))

const pendingProviderKeyStatus = computed<Record<ProviderId, boolean>>(() => ({
  openai: providerKeyStatus.value.openai || !!openaiKey.value.trim(),
  anthropic: providerKeyStatus.value.anthropic || !!anthropicKey.value.trim(),
  gemini: providerKeyStatus.value.gemini
}))

const selectedAnswerProviderHasKey = computed(
  () => pendingProviderKeyStatus.value[answerProvider.value]
)

const cloudAcknowledgementCurrent = computed(() =>
  acknowledgementMatches(
    settings.state?.cloudAnswersAcknowledgement ?? null,
    answerProvider.value,
    answerModel.value
  )
)

const semanticAcknowledgementCurrent = computed(() =>
  acknowledgementMatches(
    settings.state?.semanticIndexAcknowledgement ?? null,
    'openai',
    'text-embedding-3-small'
  )
)

const requiresCloudAcknowledgement = computed(
  () => cloudAnswersEnabled.value && !cloudDataAcknowledged.value
)

const requiresSemanticAcknowledgement = computed(
  () => semanticIndexEnabled.value && !semanticDataAcknowledged.value
)

const reindexRunning = computed(
  () => indexStatus.status.phase === 'walking' || indexStatus.status.phase === 'indexing'
)

const indexStatusLabel = computed(() => {
  const s = indexStatus.status
  if (s.phase === 'walking') return 'Scanning files'
  if (s.phase === 'indexing') return `Indexing ${s.filesDone}/${s.filesTotal} files`
  if (s.phase === 'done') return `${s.filesTotal} files, ${s.chunksTotal} chunks`
  if (s.phase === 'error') return 'Indexing error'
  return 'Not indexed yet'
})

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
  if (requiresCloudAcknowledgement.value) return false
  if (requiresSemanticAcknowledgement.value) return false
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

watch([answerProvider, answerModel], () => {
  cloudDataAcknowledged.value = cloudAcknowledgementCurrent.value
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
    cloudDataAcknowledged.value = cloudAcknowledgementCurrent.value
    semanticDataAcknowledged.value = semanticAcknowledgementCurrent.value
    searchHistoryRetention.value = s.searchHistoryRetention
    searchHistoryIncludesAnswers.value = s.searchHistoryIncludesAnswers
  }
  appVersion.value = await versionPromise
})

function acknowledgementMatches(
  acknowledgement: DataFlowAcknowledgement | null,
  provider: ProviderId,
  model: string
): boolean {
  return acknowledgement?.provider === provider && acknowledgement.model === model
}

function nextAcknowledgement(
  acknowledgement: DataFlowAcknowledgement | null,
  provider: ProviderId,
  model: string
): DataFlowAcknowledgement {
  if (acknowledgement && acknowledgementMatches(acknowledgement, provider, model)) {
    return acknowledgement
  }
  return { acknowledgedAt: new Date().toISOString(), provider, model }
}

async function pickFolder(): Promise<void> {
  const picked = await window.ryte.dialog.openFolder()
  if (picked) notesRoot.value = picked
}

async function onSave(): Promise<void> {
  if (!canSave.value) return
  const current = settings.state
  if (!current) return
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
      embeddingModel: 'text-embedding-3-small',
      cloudAnswersAcknowledgement:
        cloudAnswersEnabled.value && cloudDataAcknowledged.value
          ? nextAcknowledgement(
              current.cloudAnswersAcknowledgement,
              answerProvider.value,
              answerModel.value
            )
          : null,
      semanticIndexAcknowledgement:
        semanticIndexEnabled.value && semanticDataAcknowledged.value
          ? nextAcknowledgement(
              current.semanticIndexAcknowledgement,
              'openai',
              'text-embedding-3-small'
            )
          : null,
      searchHistoryRetention: searchHistoryRetention.value,
      searchHistoryIncludesAnswers:
        searchHistoryRetention.value !== 'off' && searchHistoryIncludesAnswers.value
    }

    if (openaiKey.value.trim()) patch.openaiKey = openaiKey.value.trim()
    if (anthropicKey.value.trim()) patch.anthropicKey = anthropicKey.value.trim()
    const deleteProviderKeys = [...deletedProviderKeys.value].filter((provider) => {
      if (provider === 'openai') return !openaiKey.value.trim()
      if (provider === 'anthropic') return !anthropicKey.value.trim()
      return true
    })
    if (deleteProviderKeys.length > 0) patch.deleteProviderKeys = deleteProviderKeys

    await settings.save(patch)
    openaiKey.value = ''
    anthropicKey.value = ''
    deletedProviderKeys.value = new Set()
    keyValidationMessage.value = {}
    emit('close')
    void indexStatus.triggerReindex()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

async function rebuildIndex(): Promise<void> {
  localError.value = null
  try {
    await indexStatus.triggerReindex()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  }
}

function onBackdropClick(): void {
  if (props.dismissable) emit('close')
}

function resetCloudAcknowledgement(): void {
  cloudDataAcknowledged.value = false
}

function resetSemanticAcknowledgement(): void {
  semanticDataAcknowledged.value = false
}

function deleteProviderKey(provider: ProviderId): void {
  deletedProviderKeys.value = new Set([...deletedProviderKeys.value, provider])
  if (provider === 'openai') openaiKey.value = ''
  if (provider === 'anthropic') anthropicKey.value = ''
  keyValidationMessage.value = {
    ...keyValidationMessage.value,
    [provider]: 'Key will be deleted when settings are saved.'
  }
}

async function validateKey(provider: ProviderId): Promise<void> {
  validatingProvider.value = provider
  localError.value = null
  try {
    const result = await window.ryte.settings.validateKey(provider)
    const message =
      result.ok && result.validatedAt
        ? `Validated ${new Date(result.validatedAt).toLocaleString()}`
        : (result.error ?? 'Validation failed.')
    keyValidationMessage.value = {
      ...keyValidationMessage.value,
      [provider]: message
    }
    if (result.ok) await settings.hydrate()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  } finally {
    validatingProvider.value = null
  }
}

function keyMetadataLabel(provider: ProviderId): string {
  const validatedAt = settings.state?.providerKeyMetadata[provider]?.lastValidatedAt
  return validatedAt ? `Last validated ${new Date(validatedAt).toLocaleString()}` : 'Not validated'
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

        <section class="settings-section" aria-labelledby="local-data-title">
          <h3 id="local-data-title">Local Data</h3>
          <div class="static-row">
            <span>Index status</span>
            <strong>{{ indexStatusLabel }}</strong>
          </div>
          <div class="button-row">
            <button type="button" :disabled="saving || reindexRunning" @click="rebuildIndex">
              {{ reindexRunning ? 'Rebuilding...' : 'Rebuild Index' }}
            </button>
            <button
              type="button"
              :disabled="saving || search.history.length === 0"
              @click="search.clearHistory"
            >
              Clear Search History
            </button>
          </div>
          <label>
            <span>Search history</span>
            <select v-model="searchHistoryRetention" :disabled="saving">
              <option value="off">Off</option>
              <option value="session">This session only</option>
              <option value="7-days">7 days</option>
              <option value="30-days">30 days</option>
              <option value="forever">Forever</option>
            </select>
          </label>
          <label class="check-row">
            <input
              v-model="searchHistoryIncludesAnswers"
              type="checkbox"
              :disabled="saving || searchHistoryRetention === 'off'"
            />
            <span>Include generated answers and citations in history</span>
          </label>
          <p
            v-if="indexStatus.status.phase === 'error' && indexStatus.status.error"
            class="error-text"
          >
            {{ indexStatus.status.error }}
          </p>
          <p class="hint-text">
            Rebuilding the index uses local markdown files and does not require provider keys. By
            default, saved search history keeps queries only.
          </p>
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
          <label v-if="semanticIndexEnabled" class="check-row">
            <input v-model="semanticDataAcknowledged" type="checkbox" :disabled="saving" />
            <span>I understand note chunks will be sent to OpenAI for embeddings.</span>
          </label>
          <div
            v-if="settings.state?.semanticIndexAcknowledgement"
            class="button-row button-row--inline"
          >
            <button type="button" :disabled="saving" @click="resetSemanticAcknowledgement">
              Reset Semantic Consent
            </button>
          </div>
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
          <label v-if="cloudAnswersEnabled" class="check-row">
            <input v-model="cloudDataAcknowledged" type="checkbox" :disabled="saving" />
            <span>
              I understand my query and selected note excerpts will be sent to
              {{ answerProvider === 'openai' ? 'OpenAI' : 'Anthropic' }}.
            </span>
          </label>
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
          <div
            v-if="settings.state?.cloudAnswersAcknowledgement"
            class="button-row button-row--inline"
          >
            <button type="button" :disabled="saving" @click="resetCloudAcknowledgement">
              Reset Cloud Consent
            </button>
          </div>
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
          <div class="key-actions">
            <span class="hint-text">{{ keyMetadataLabel('openai') }}</span>
            <div class="button-row button-row--inline">
              <button
                type="button"
                :disabled="saving || validatingProvider !== null || !providerKeyStatus.openai"
                @click="validateKey('openai')"
              >
                {{ validatingProvider === 'openai' ? 'Validating...' : 'Validate Saved Key' }}
              </button>
              <button
                type="button"
                :disabled="saving || !providerKeyStatus.openai"
                @click="deleteProviderKey('openai')"
              >
                Delete Key
              </button>
            </div>
            <p v-if="keyValidationMessage.openai" class="hint-text">
              {{ keyValidationMessage.openai }}
            </p>
          </div>
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
          <div class="key-actions">
            <span class="hint-text">{{ keyMetadataLabel('anthropic') }}</span>
            <div class="button-row button-row--inline">
              <button
                type="button"
                :disabled="saving || validatingProvider !== null || !providerKeyStatus.anthropic"
                @click="validateKey('anthropic')"
              >
                {{ validatingProvider === 'anthropic' ? 'Validating...' : 'Validate Saved Key' }}
              </button>
              <button
                type="button"
                :disabled="saving || !providerKeyStatus.anthropic"
                @click="deleteProviderKey('anthropic')"
              >
                Delete Key
              </button>
            </div>
            <p v-if="keyValidationMessage.anthropic" class="hint-text">
              {{ keyValidationMessage.anthropic }}
            </p>
          </div>
          <div class="static-row">
            <span>Gemini</span>
            <strong>Planned</strong>
          </div>
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
.button-row,
.static-row {
  display: flex;
  gap: 0.5rem;
}

.button-row {
  flex-wrap: wrap;
}

.button-row--inline {
  align-items: center;
}

.key-actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
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
