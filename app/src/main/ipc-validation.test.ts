import { describe, expect, it } from 'vitest'

import {
  assertValidAbsolutePath,
  assertValidRequestId,
  assertValidSearchOptions,
  assertValidSearchQuery,
  assertValidSourceFileInput,
  assertValidSettingsPatch,
  assertValidWorkspaceCloseTabInput,
  assertValidWorkspaceFocusTabInput,
  assertValidWorkspaceOpenFileInput,
  assertValidWorkspaceRecordRecentInput,
  assertValidWorkspaceSetOutlineCollapsedInput,
  assertValidWorkspaceShellPatch,
  assertValidWorkspaceUpdateTabViewModeInput,
  assertValidWorkspaceWindowPatch
} from './ipc-validation'

describe('ipc validation', () => {
  it('accepts expected request ids, paths, and queries', () => {
    expect(assertValidRequestId('1f9c5da2-4020-4af6-92ac-111111111111')).toBe(
      '1f9c5da2-4020-4af6-92ac-111111111111'
    )
    expect(assertValidAbsolutePath('/tmp/notes/a.md')).toBe('/tmp/notes/a.md')
    expect(assertValidSearchQuery('  project plan  ')).toBe('project plan')
    expect(
      assertValidSearchOptions({ retrievalMode: 'keyword', answerMode: 'local-only' })
    ).toEqual({
      retrievalMode: 'keyword',
      answerMode: 'local-only'
    })
  })

  it('rejects malformed primitive inputs', () => {
    expect(() => assertValidRequestId('req-1')).toThrow('Invalid request id')
    expect(() => assertValidAbsolutePath('../notes/a.md')).toThrow('Invalid file path')
    expect(() => assertValidSearchQuery('')).toThrow('Invalid search query')
    expect(() => assertValidSearchOptions({ retrievalMode: 'remote' })).toThrow(
      'Invalid retrieval mode'
    )
    expect(() => assertValidSearchOptions({ arbitrary: true })).toThrow('Invalid search option')
  })

  it('accepts a narrow settings patch', () => {
    expect(
      assertValidSettingsPatch({
        notesRoot: '/tmp/notes',
        cloudAnswersEnabled: true,
        cloudAnswersAcknowledgement: {
          acknowledgedAt: '2026-05-19T12:00:00.000Z',
          provider: 'openai',
          model: 'gpt-5.2'
        },
        answerProvider: 'openai',
        answerModel: 'gpt-5.2',
        searchHistoryRetention: '30-days',
        searchHistoryIncludesAnswers: false,
        scrollbarVisibility: 'always'
      })
    ).toMatchObject({
      notesRoot: '/tmp/notes',
      cloudAnswersEnabled: true,
      answerProvider: 'openai',
      answerModel: 'gpt-5.2',
      scrollbarVisibility: 'always'
    })
  })

  it('rejects unexpected settings keys and invalid ids', () => {
    expect(() => assertValidSettingsPatch({ arbitrary: true })).toThrow('Invalid settings key')
    expect(() => assertValidSettingsPatch({ answerModel: 'not-a-model' })).toThrow(
      'Invalid answer model'
    )
    expect(() => assertValidSettingsPatch({ scrollbarVisibility: 'visible' })).toThrow(
      'Invalid scrollbar visibility'
    )
  })

  it('accepts narrow workspace shell and window patches', () => {
    expect(assertValidWorkspaceShellPatch({ sidebarCollapsed: true, sidebarWidth: 360 })).toEqual({
      sidebarCollapsed: true,
      sidebarWidth: 360
    })
    expect(
      assertValidWorkspaceWindowPatch({
        bounds: { x: 10, y: 20, width: 1460, height: 980 },
        maximized: false,
        fullscreen: false
      })
    ).toEqual({
      bounds: { x: 10, y: 20, width: 1460, height: 980 },
      maximized: false,
      fullscreen: false
    })
  })

  it('rejects unexpected workspace keys and invalid dimensions', () => {
    expect(() => assertValidWorkspaceShellPatch({ arbitrary: true })).toThrow(
      'Invalid workspace shell key'
    )
    expect(() => assertValidWorkspaceShellPatch({ sidebarWidth: -1 })).toThrow(
      'Invalid sidebarWidth'
    )
    expect(() => assertValidWorkspaceWindowPatch({ arbitrary: true })).toThrow(
      'Invalid workspace window key'
    )
    expect(() =>
      assertValidWorkspaceWindowPatch({ bounds: { x: 0, y: 0, width: 0, height: 100 } })
    ).toThrow('Invalid window bounds')
  })

  it('accepts narrow workspace operation payloads', () => {
    expect(assertValidWorkspaceOpenFileInput({ sourcePath: 'folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(assertValidWorkspaceFocusTabInput({ tabId: 'tab-1' })).toEqual({ tabId: 'tab-1' })
    expect(assertValidWorkspaceCloseTabInput({ tabId: 'tab-1' })).toEqual({ tabId: 'tab-1' })
    expect(
      assertValidWorkspaceUpdateTabViewModeInput({ tabId: 'tab-1', viewMode: 'source' })
    ).toEqual({
      tabId: 'tab-1',
      viewMode: 'source'
    })
    expect(assertValidWorkspaceRecordRecentInput({ sourcePath: './folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(assertValidSourceFileInput({ sourcePath: './folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(
      assertValidWorkspaceSetOutlineCollapsedInput({
        sourcePath: 'folder/a.md',
        collapsed: false
      })
    ).toEqual({
      sourcePath: 'folder/a.md',
      collapsed: false
    })
  })

  it('rejects invalid workspace operation source paths and unknown keys', () => {
    expect(() => assertValidWorkspaceOpenFileInput({ sourcePath: '/tmp/a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidWorkspaceOpenFileInput({ sourcePath: '../a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() =>
      assertValidWorkspaceOpenFileInput({ sourcePath: 'a.md', arbitrary: true })
    ).toThrow('Invalid workspace open file input key')
    expect(() => assertValidWorkspaceRecordRecentInput({ sourcePath: 'a\0.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidSourceFileInput({ sourcePath: '/tmp/a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidSourceFileInput({ sourcePath: '../a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidSourceFileInput({ sourcePath: 'a.md', arbitrary: true })).toThrow(
      'Invalid source file input key'
    )
  })

  it('rejects invalid workspace operation tab ids and view modes', () => {
    expect(() => assertValidWorkspaceFocusTabInput({ tabId: '' })).toThrow(
      'Invalid workspace tab id'
    )
    expect(() => assertValidWorkspaceCloseTabInput({ tabId: '../tab' })).toThrow(
      'Invalid workspace tab id'
    )
    expect(() =>
      assertValidWorkspaceUpdateTabViewModeInput({ tabId: 'tab-1', viewMode: 'diff' })
    ).toThrow('Invalid workspace tab view mode')
    expect(() =>
      assertValidWorkspaceSetOutlineCollapsedInput({ sourcePath: 'a.md', collapsed: 'yes' })
    ).toThrow('Invalid workspace outline state')
  })
})
