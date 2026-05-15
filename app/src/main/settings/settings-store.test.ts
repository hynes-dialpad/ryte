import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (kind: string) => {
      if (kind === 'userData') return tempDir
      if (kind === 'home') return '/Users/test'
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
    expect(state.notesRoot).toBe('/Users/test/notes')
    expect(state.model).toBe('claude-haiku-4-5')
    expect(state.hasAnthropicKey).toBe(false)
    expect(state.hasOpenAIKey).toBe(false)
    expect(state.keychainAvailable).toBe(true)
  })

  it('persists notes root and model on update', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({ notesRoot: '/tmp/notes', model: 'claude-sonnet-4-6' })
    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.notesRoot).toBe('/tmp/notes')
    expect(state.model).toBe('claude-sonnet-4-6')
  })

  it('encrypts api keys round-trip via keychain', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({ anthropicKey: 'sk-ant-xyz', openaiKey: 'sk-openai-abc' })

    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.hasAnthropicKey).toBe(true)
    expect(state.hasOpenAIKey).toBe(true)
    expect(fresh.getSecret('anthropic')).toBe('sk-ant-xyz')
    expect(fresh.getSecret('openai')).toBe('sk-openai-abc')
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
