import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { defaultNotesRoot, settingsFilePath } from '../paths'
import { keychain } from './keychain'

export type ProviderId = 'anthropic' | 'openai'

export type ModelId =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'
  | 'gpt-4o-mini'
  | 'gpt-4o'

export function modelProvider(model: ModelId): 'anthropic' | 'openai' {
  return model.startsWith('gpt-') ? 'openai' : 'anthropic'
}

export interface SettingsFile {
  notesRoot: string
  model: ModelId
  encryptedKeys: Partial<Record<ProviderId, string>>
}

export interface PublicSettingsState {
  notesRoot: string
  model: ModelId
  hasAnthropicKey: boolean
  hasOpenAIKey: boolean
  keychainAvailable: boolean
}

export interface SettingsUpdate {
  notesRoot?: string
  model?: ModelId
  anthropicKey?: string
  openaiKey?: string
}

function defaultSettings(): SettingsFile {
  return {
    notesRoot: defaultNotesRoot(),
    model: 'claude-haiku-4-5',
    encryptedKeys: {}
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
    const parsed = JSON.parse(raw) as Partial<SettingsFile>
    this.cache = {
      ...defaultSettings(),
      ...parsed,
      encryptedKeys: parsed.encryptedKeys ?? {}
    }
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
      model: s.model,
      hasAnthropicKey: !!s.encryptedKeys.anthropic,
      hasOpenAIKey: !!s.encryptedKeys.openai,
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
    if (patch.model !== undefined) next.model = patch.model

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

    this.persist(next)
    return this.publicState()
  }
}

export const settingsStore = new SettingsStore()
