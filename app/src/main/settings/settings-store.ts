import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { defaultNotesRoot, settingsFilePath } from '../paths'
import { keychain } from './keychain'

export const SETTINGS_SCHEMA_VERSION = 2

export type ProviderId = 'anthropic' | 'openai' | 'gemini'
export type AnswerProviderId = 'anthropic' | 'openai'
export type EmbeddingProviderId = 'openai'

export type ModelId =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'
  | 'gpt-5.2'
  | 'gpt-5.1'
  | 'gpt-4o-mini'
  | 'gpt-4o'

export type AnswerModelId = ModelId
export type EmbeddingModelId = 'text-embedding-3-small'

export function modelProvider(model: ModelId): AnswerProviderId {
  return model.startsWith('gpt-') ? 'openai' : 'anthropic'
}

export function defaultAnswerModelForProvider(provider: AnswerProviderId): AnswerModelId {
  return provider === 'openai' ? 'gpt-5.2' : 'claude-haiku-4-5'
}

export interface SettingsFile {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION
  notesRoot: string
  cloudAnswersEnabled: boolean
  semanticIndexEnabled: boolean
  firstCloudUseAcknowledgedAt: string | null
  answerProvider: AnswerProviderId
  answerModel: AnswerModelId
  embeddingProvider: EmbeddingProviderId
  embeddingModel: EmbeddingModelId
  encryptedKeys: Partial<Record<ProviderId, string>>
}

export interface PublicSettingsState {
  notesRoot: string
  model: ModelId
  cloudAnswersEnabled: boolean
  semanticIndexEnabled: boolean
  firstCloudUseAcknowledgedAt: string | null
  answerProvider: AnswerProviderId
  answerModel: AnswerModelId
  embeddingProvider: EmbeddingProviderId
  embeddingModel: EmbeddingModelId
  hasAnthropicKey: boolean
  hasOpenAIKey: boolean
  hasGeminiKey: boolean
  keychainAvailable: boolean
}

export interface SettingsUpdate {
  notesRoot?: string
  model?: ModelId
  cloudAnswersEnabled?: boolean
  semanticIndexEnabled?: boolean
  firstCloudUseAcknowledgedAt?: string | null
  answerProvider?: AnswerProviderId
  answerModel?: AnswerModelId
  embeddingProvider?: EmbeddingProviderId
  embeddingModel?: EmbeddingModelId
  anthropicKey?: string
  openaiKey?: string
  geminiKey?: string
}

function defaultSettings(): SettingsFile {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    notesRoot: defaultNotesRoot(),
    cloudAnswersEnabled: false,
    semanticIndexEnabled: false,
    firstCloudUseAcknowledgedAt: null,
    answerProvider: 'openai',
    answerModel: 'gpt-5.2',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    encryptedKeys: {}
  }
}

function isModelId(value: unknown): value is ModelId {
  return (
    value === 'claude-haiku-4-5' ||
    value === 'claude-sonnet-4-6' ||
    value === 'claude-opus-4-7' ||
    value === 'gpt-5.2' ||
    value === 'gpt-5.1' ||
    value === 'gpt-4o-mini' ||
    value === 'gpt-4o'
  )
}

function isAnswerProviderId(value: unknown): value is AnswerProviderId {
  return value === 'anthropic' || value === 'openai'
}

function isEmbeddingModelId(value: unknown): value is EmbeddingModelId {
  return value === 'text-embedding-3-small'
}

function migrateSettings(parsed: Partial<SettingsFile> & { model?: ModelId }): SettingsFile {
  const defaults = defaultSettings()
  const legacyModel = isModelId(parsed.model) ? parsed.model : null
  const answerModel = isModelId(parsed.answerModel)
    ? parsed.answerModel
    : (legacyModel ?? defaults.answerModel)
  const answerProvider = isAnswerProviderId(parsed.answerProvider)
    ? parsed.answerProvider
    : modelProvider(answerModel)

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    notesRoot: typeof parsed.notesRoot === 'string' ? parsed.notesRoot : defaults.notesRoot,
    cloudAnswersEnabled:
      typeof parsed.cloudAnswersEnabled === 'boolean'
        ? parsed.cloudAnswersEnabled
        : defaults.cloudAnswersEnabled,
    semanticIndexEnabled:
      typeof parsed.semanticIndexEnabled === 'boolean'
        ? parsed.semanticIndexEnabled
        : defaults.semanticIndexEnabled,
    firstCloudUseAcknowledgedAt:
      typeof parsed.firstCloudUseAcknowledgedAt === 'string'
        ? parsed.firstCloudUseAcknowledgedAt
        : null,
    answerProvider,
    answerModel:
      modelProvider(answerModel) === answerProvider
        ? answerModel
        : defaultAnswerModelForProvider(answerProvider),
    embeddingProvider: 'openai',
    embeddingModel: isEmbeddingModelId(parsed.embeddingModel)
      ? parsed.embeddingModel
      : defaults.embeddingModel,
    encryptedKeys: parsed.encryptedKeys ?? {}
  }
}

export class SettingsStore {
  private cache: SettingsFile | null = null

  load(): SettingsFile {
    if (this.cache) return this.cache
    const path = settingsFilePath()
    if (!existsSync(path)) {
      this.cache = defaultSettings()
      return this.cache
    }
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SettingsFile> & { model?: ModelId }
    this.cache = migrateSettings(parsed)
    if (parsed.schemaVersion !== SETTINGS_SCHEMA_VERSION) this.persist(this.cache)
    return this.cache
  }

  private persist(next: SettingsFile): void {
    const path = settingsFilePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8')
    this.cache = next
  }

  publicState(): PublicSettingsState {
    const s = this.load()
    return {
      notesRoot: s.notesRoot,
      model: s.answerModel,
      cloudAnswersEnabled: s.cloudAnswersEnabled,
      semanticIndexEnabled: s.semanticIndexEnabled,
      firstCloudUseAcknowledgedAt: s.firstCloudUseAcknowledgedAt,
      answerProvider: s.answerProvider,
      answerModel: s.answerModel,
      embeddingProvider: s.embeddingProvider,
      embeddingModel: s.embeddingModel,
      hasAnthropicKey: !!s.encryptedKeys.anthropic,
      hasOpenAIKey: !!s.encryptedKeys.openai,
      hasGeminiKey: !!s.encryptedKeys.gemini,
      keychainAvailable: keychain.isAvailable()
    }
  }

  getSecret(provider: ProviderId): string | null {
    const s = this.load()
    const encoded = s.encryptedKeys[provider]
    if (!encoded) return null
    return keychain.decrypt(encoded)
  }

  update(patch: SettingsUpdate): PublicSettingsState {
    const current = this.load()
    const next: SettingsFile = {
      ...current,
      encryptedKeys: { ...current.encryptedKeys }
    }
    if (patch.notesRoot !== undefined) next.notesRoot = patch.notesRoot
    if (patch.cloudAnswersEnabled !== undefined) {
      next.cloudAnswersEnabled = patch.cloudAnswersEnabled
    }
    if (patch.semanticIndexEnabled !== undefined) {
      next.semanticIndexEnabled = patch.semanticIndexEnabled
    }
    if (patch.firstCloudUseAcknowledgedAt !== undefined) {
      next.firstCloudUseAcknowledgedAt = patch.firstCloudUseAcknowledgedAt
    }
    if (patch.answerProvider !== undefined) next.answerProvider = patch.answerProvider
    if (patch.answerModel !== undefined) {
      next.answerModel = patch.answerModel
      next.answerProvider = modelProvider(patch.answerModel)
    }
    if (patch.model !== undefined) {
      next.answerModel = patch.model
      next.answerProvider = modelProvider(patch.model)
    }
    if (modelProvider(next.answerModel) !== next.answerProvider) {
      next.answerModel = defaultAnswerModelForProvider(next.answerProvider)
    }
    if (patch.embeddingProvider !== undefined) next.embeddingProvider = patch.embeddingProvider
    if (patch.embeddingModel !== undefined) next.embeddingModel = patch.embeddingModel

    if (patch.anthropicKey !== undefined) {
      const enc = keychain.encrypt(patch.anthropicKey)
      if (enc === null) throw new Error('Keychain unavailable')
      next.encryptedKeys.anthropic = enc
    }
    if (patch.openaiKey !== undefined) {
      const enc = keychain.encrypt(patch.openaiKey)
      if (enc === null) throw new Error('Keychain unavailable')
      next.encryptedKeys.openai = enc
    }
    if (patch.geminiKey !== undefined) {
      const enc = keychain.encrypt(patch.geminiKey)
      if (enc === null) throw new Error('Keychain unavailable')
      next.encryptedKeys.gemini = enc
    }

    this.persist(next)
    return this.publicState()
  }
}

export const settingsStore = new SettingsStore()
