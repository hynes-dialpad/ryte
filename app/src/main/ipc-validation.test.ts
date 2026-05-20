import { describe, expect, it } from 'vitest'

import {
  assertValidAbsolutePath,
  assertValidRequestId,
  assertValidSearchQuery,
  assertValidSettingsPatch
} from './ipc-validation'

describe('ipc validation', () => {
  it('accepts expected request ids, paths, and queries', () => {
    expect(assertValidRequestId('1f9c5da2-4020-4af6-92ac-111111111111')).toBe(
      '1f9c5da2-4020-4af6-92ac-111111111111'
    )
    expect(assertValidAbsolutePath('/tmp/notes/a.md')).toBe('/tmp/notes/a.md')
    expect(assertValidSearchQuery('  project plan  ')).toBe('project plan')
  })

  it('rejects malformed primitive inputs', () => {
    expect(() => assertValidRequestId('req-1')).toThrow('Invalid request id')
    expect(() => assertValidAbsolutePath('../notes/a.md')).toThrow('Invalid file path')
    expect(() => assertValidSearchQuery('')).toThrow('Invalid search query')
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
        searchHistoryIncludesAnswers: false
      })
    ).toMatchObject({
      notesRoot: '/tmp/notes',
      cloudAnswersEnabled: true,
      answerProvider: 'openai',
      answerModel: 'gpt-5.2'
    })
  })

  it('rejects unexpected settings keys and invalid ids', () => {
    expect(() => assertValidSettingsPatch({ arbitrary: true })).toThrow('Invalid settings key')
    expect(() => assertValidSettingsPatch({ answerModel: 'not-a-model' })).toThrow(
      'Invalid answer model'
    )
  })
})
