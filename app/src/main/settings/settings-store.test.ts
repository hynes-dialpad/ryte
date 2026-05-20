import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (kind: string) => {
      if (kind === 'userData') return tempDir
      if (kind === 'home') return '/Users/test'
      if (kind === 'documents') return '/Users/test/Documents'
      throw new Error(`unexpected getPath: ${kind}`)
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8').replace(/^enc:/, '')
  }
}))

describe('SettingsStore', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-settings-'))
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns defaults when no file exists', async () => {
    const { settingsStore } = await import('./settings-store')
    const state = settingsStore.publicState()
    expect(state.notesRoot).toBe('/Users/test/Documents/Ryte')
    expect(state.model).toBe('gpt-5.2')
    expect(state.answerProvider).toBe('openai')
    expect(state.answerModel).toBe('gpt-5.2')
    expect(state.embeddingProvider).toBe('openai')
    expect(state.embeddingModel).toBe('text-embedding-3-small')
    expect(state.cloudAnswersEnabled).toBe(false)
    expect(state.semanticIndexEnabled).toBe(false)
    expect(state.firstCloudUseAcknowledgedAt).toBeNull()
    expect(state.hasAnthropicKey).toBe(false)
    expect(state.hasOpenAIKey).toBe(false)
    expect(state.hasGeminiKey).toBe(false)
    expect(state.keychainAvailable).toBe(true)
  })

  it('persists notes root and model on update', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({
      notesRoot: '/tmp/notes',
      answerProvider: 'anthropic',
      answerModel: 'claude-sonnet-4-6'
    })
    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.notesRoot).toBe('/tmp/notes')
    expect(state.model).toBe('claude-sonnet-4-6')
    expect(state.answerProvider).toBe('anthropic')
  })

  it('encrypts api keys round-trip via keychain', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({
      anthropicKey: 'sk-ant-xyz',
      openaiKey: 'sk-openai-abc',
      geminiKey: 'gemini-abc'
    })

    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.hasAnthropicKey).toBe(true)
    expect(state.hasOpenAIKey).toBe(true)
    expect(state.hasGeminiKey).toBe(true)
    expect(fresh.getSecret('anthropic')).toBe('sk-ant-xyz')
    expect(fresh.getSecret('openai')).toBe('sk-openai-abc')
    expect(fresh.getSecret('gemini')).toBe('gemini-abc')
  })

  it('persists cloud and semantic capability settings', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({
      cloudAnswersEnabled: true,
      semanticIndexEnabled: true,
      firstCloudUseAcknowledgedAt: '2026-05-19T12:00:00.000Z'
    })

    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.cloudAnswersEnabled).toBe(true)
    expect(state.semanticIndexEnabled).toBe(true)
    expect(state.firstCloudUseAcknowledgedAt).toBe('2026-05-19T12:00:00.000Z')
  })

  it('migrates the legacy single-model settings file', async () => {
    const legacyAnthropicKey = Buffer.from('enc:sk-ant-legacy', 'utf-8').toString('base64')
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({
        notesRoot: '/tmp/legacy-notes',
        model: 'claude-sonnet-4-6',
        encryptedKeys: { anthropic: legacyAnthropicKey }
      }),
      'utf-8'
    )

    const { SettingsStore, SETTINGS_SCHEMA_VERSION } = await import('./settings-store')
    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.notesRoot).toBe('/tmp/legacy-notes')
    expect(state.answerProvider).toBe('anthropic')
    expect(state.answerModel).toBe('claude-sonnet-4-6')
    expect(state.cloudAnswersEnabled).toBe(false)
    expect(state.semanticIndexEnabled).toBe(false)
    expect(fresh.getSecret('anthropic')).toBe('sk-ant-legacy')

    const saved = JSON.parse(readFileSync(join(tempDir, 'settings.json'), 'utf-8')) as {
      schemaVersion: number
    }
    expect(saved.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
  })

  it('does not include plaintext keys in publicState', async () => {
    const { settingsStore } = await import('./settings-store')
    settingsStore.update({ anthropicKey: 'sk-ant-secret-value' })
    const serialized = JSON.stringify(settingsStore.publicState())
    expect(serialized).not.toContain('sk-ant-secret-value')
  })

  it('throws when keychain is unavailable', async () => {
    const electronMod = await import('electron')
    vi.spyOn(electronMod.safeStorage, 'isEncryptionAvailable').mockReturnValue(false)
    const { SettingsStore } = await import('./settings-store')
    const store = new SettingsStore()
    expect(() => store.update({ anthropicKey: 'sk-ant-xyz' })).toThrow('Keychain unavailable')
  })
})
