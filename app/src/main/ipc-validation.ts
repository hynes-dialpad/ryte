import { isAbsolute, normalize, sep, win32 } from 'node:path'

import type {
  DataFlowAcknowledgement,
  SearchHistoryRetention,
  SettingsUpdate
} from './settings/settings-store'
import type { SearchOptions } from './search/search-service'
import type {
  WorkspaceCloseTabInput,
  WorkspaceFocusTabInput,
  WorkspaceOpenFileInput,
  WorkspaceRecordRecentInput,
  WorkspaceSetOutlineCollapsedInput,
  WorkspaceShellUpdate,
  WorkspaceUpdateTabViewModeInput,
  WorkspaceViewMode,
  WorkspaceWindowUpdate
} from '../shared/workspace'
import {
  isAnswerModelId,
  isAnswerProviderId,
  isEmbeddingModelId,
  isEmbeddingProviderId,
  isProviderId,
  type ProviderId
} from '../shared/provider-registry'

const MAX_PATH_LENGTH = 4096
const MAX_QUERY_LENGTH = 2000
const MAX_WINDOW_DIMENSION = 10000
const MAX_SIDEBAR_WIDTH = 4000
const MAX_TAB_ID_LENGTH = 200
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORKSPACE_TAB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,199}$/

const SETTINGS_KEYS = new Set([
  'notesRoot',
  'model',
  'cloudAnswersEnabled',
  'semanticIndexEnabled',
  'firstCloudUseAcknowledgedAt',
  'cloudAnswersAcknowledgement',
  'semanticIndexAcknowledgement',
  'answerProvider',
  'answerModel',
  'embeddingProvider',
  'embeddingModel',
  'searchHistoryRetention',
  'searchHistoryIncludesAnswers',
  'anthropicKey',
  'openaiKey',
  'geminiKey',
  'deleteProviderKeys'
])

export function assertValidRequestId(value: unknown): string {
  if (typeof value !== 'string' || !REQUEST_ID_RE.test(value)) {
    throw new Error('Invalid request id')
  }
  return value
}

export function assertValidAbsolutePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PATH_LENGTH ||
    !isAbsolute(value)
  ) {
    throw new Error('Invalid file path')
  }
  return value
}

function assertObjectWithKeys(
  value: unknown,
  allowedKeys: readonly string[],
  label: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`)
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) throw new Error(`Invalid ${label} key: ${key}`)
  }
  return input
}

function hasParentTraversal(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment === '..')
}

function assertValidWorkspaceSourcePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PATH_LENGTH ||
    value.includes('\0') ||
    isAbsolute(value) ||
    win32.isAbsolute(value) ||
    hasParentTraversal(value)
  ) {
    throw new Error('Invalid workspace source path')
  }

  const sourcePath = normalize(value)
  if (
    sourcePath === '.' ||
    sourcePath === '..' ||
    sourcePath.includes('\0') ||
    isAbsolute(sourcePath) ||
    win32.isAbsolute(sourcePath) ||
    sourcePath.startsWith(`..${sep}`)
  ) {
    throw new Error('Invalid workspace source path')
  }

  return sourcePath
}

function assertValidWorkspaceTabId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TAB_ID_LENGTH ||
    value.includes('\0') ||
    !WORKSPACE_TAB_ID_RE.test(value)
  ) {
    throw new Error('Invalid workspace tab id')
  }
  return value
}

function assertValidWorkspaceViewMode(value: unknown): WorkspaceViewMode {
  if (value !== 'preview' && value !== 'source') {
    throw new Error('Invalid workspace tab view mode')
  }
  return value
}

export function assertValidSearchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid search query')
  const query = value.trim()
  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) {
    throw new Error('Invalid search query')
  }
  return query
}

function isSearchRetrievalMode(
  value: unknown
): value is NonNullable<SearchOptions['retrievalMode']> {
  return value === 'auto' || value === 'keyword' || value === 'hybrid'
}

function isSearchAnswerMode(value: unknown): value is NonNullable<SearchOptions['answerMode']> {
  return value === 'settings' || value === 'local-only'
}

export function assertValidSearchOptions(value: unknown): SearchOptions {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid search options')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== 'retrievalMode' && key !== 'answerMode') {
      throw new Error(`Invalid search option: ${key}`)
    }
  }
  const options: SearchOptions = {}
  if ('retrievalMode' in input) {
    if (!isSearchRetrievalMode(input.retrievalMode)) throw new Error('Invalid retrieval mode')
    options.retrievalMode = input.retrievalMode
  }
  if ('answerMode' in input) {
    if (!isSearchAnswerMode(input.answerMode)) throw new Error('Invalid answer mode')
    options.answerMode = input.answerMode
  }
  return options
}

export function assertValidProviderId(value: unknown): ProviderId {
  if (!isProviderId(value)) throw new Error('Invalid provider')
  return value
}

function isSearchHistoryRetention(value: unknown): value is SearchHistoryRetention {
  return (
    value === 'off' ||
    value === 'session' ||
    value === '7-days' ||
    value === '30-days' ||
    value === 'forever'
  )
}

function isDataFlowAcknowledgement(value: unknown): value is DataFlowAcknowledgement {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DataFlowAcknowledgement>
  return (
    typeof candidate.acknowledgedAt === 'string' &&
    isProviderId(candidate.provider) &&
    typeof candidate.model === 'string' &&
    candidate.model.length > 0
  )
}

function assertOptionalBoolean(value: unknown, key: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${key}`)
  return value
}

function assertOptionalKey(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${key}`)
  }
  return value.trim()
}

export function assertValidSettingsPatch(value: unknown): SettingsUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid settings patch')
  }

  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (!SETTINGS_KEYS.has(key)) throw new Error(`Invalid settings key: ${key}`)
  }

  const patch: SettingsUpdate = {}
  if ('notesRoot' in input) patch.notesRoot = assertValidAbsolutePath(input.notesRoot)
  if ('model' in input) {
    if (!isAnswerModelId(input.model)) throw new Error('Invalid model')
    patch.model = input.model
  }
  if ('cloudAnswersEnabled' in input) {
    patch.cloudAnswersEnabled = assertOptionalBoolean(
      input.cloudAnswersEnabled,
      'cloudAnswersEnabled'
    )
  }
  if ('semanticIndexEnabled' in input) {
    patch.semanticIndexEnabled = assertOptionalBoolean(
      input.semanticIndexEnabled,
      'semanticIndexEnabled'
    )
  }
  if ('firstCloudUseAcknowledgedAt' in input) {
    if (
      input.firstCloudUseAcknowledgedAt !== null &&
      typeof input.firstCloudUseAcknowledgedAt !== 'string'
    ) {
      throw new Error('Invalid first cloud acknowledgement')
    }
    patch.firstCloudUseAcknowledgedAt = input.firstCloudUseAcknowledgedAt
  }
  if ('cloudAnswersAcknowledgement' in input) {
    if (!isDataFlowAcknowledgement(input.cloudAnswersAcknowledgement)) {
      throw new Error('Invalid cloud answers acknowledgement')
    }
    patch.cloudAnswersAcknowledgement = input.cloudAnswersAcknowledgement
  }
  if ('semanticIndexAcknowledgement' in input) {
    if (!isDataFlowAcknowledgement(input.semanticIndexAcknowledgement)) {
      throw new Error('Invalid semantic index acknowledgement')
    }
    patch.semanticIndexAcknowledgement = input.semanticIndexAcknowledgement
  }
  if ('answerProvider' in input) {
    if (!isAnswerProviderId(input.answerProvider)) throw new Error('Invalid answer provider')
    patch.answerProvider = input.answerProvider
  }
  if ('answerModel' in input) {
    if (!isAnswerModelId(input.answerModel)) throw new Error('Invalid answer model')
    patch.answerModel = input.answerModel
  }
  if ('embeddingProvider' in input) {
    if (!isEmbeddingProviderId(input.embeddingProvider)) {
      throw new Error('Invalid embedding provider')
    }
    patch.embeddingProvider = input.embeddingProvider
  }
  if ('embeddingModel' in input) {
    if (!isEmbeddingModelId(input.embeddingModel)) throw new Error('Invalid embedding model')
    patch.embeddingModel = input.embeddingModel
  }
  if ('searchHistoryRetention' in input) {
    if (!isSearchHistoryRetention(input.searchHistoryRetention)) {
      throw new Error('Invalid search history retention')
    }
    patch.searchHistoryRetention = input.searchHistoryRetention
  }
  if ('searchHistoryIncludesAnswers' in input) {
    patch.searchHistoryIncludesAnswers = assertOptionalBoolean(
      input.searchHistoryIncludesAnswers,
      'searchHistoryIncludesAnswers'
    )
  }
  if ('anthropicKey' in input)
    patch.anthropicKey = assertOptionalKey(input.anthropicKey, 'anthropicKey')
  if ('openaiKey' in input) patch.openaiKey = assertOptionalKey(input.openaiKey, 'openaiKey')
  if ('geminiKey' in input) patch.geminiKey = assertOptionalKey(input.geminiKey, 'geminiKey')
  if ('deleteProviderKeys' in input) {
    if (!Array.isArray(input.deleteProviderKeys)) throw new Error('Invalid deleteProviderKeys')
    patch.deleteProviderKeys = input.deleteProviderKeys.map(assertValidProviderId)
  }

  return patch
}

function assertFiniteNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${key}`)
  }
  return value
}

function assertValidWindowBounds(value: unknown): NonNullable<WorkspaceWindowUpdate['bounds']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid window bounds')
  }
  const input = value as Record<string, unknown>
  const x = assertFiniteNumber(input.x, 'window x')
  const y = assertFiniteNumber(input.y, 'window y')
  const width = assertFiniteNumber(input.width, 'window width')
  const height = assertFiniteNumber(input.height, 'window height')
  if (width <= 0 || width > MAX_WINDOW_DIMENSION || height <= 0 || height > MAX_WINDOW_DIMENSION) {
    throw new Error('Invalid window bounds')
  }
  return { x, y, width, height }
}

export function assertValidWorkspaceShellPatch(value: unknown): WorkspaceShellUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid workspace shell patch')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== 'sidebarCollapsed' && key !== 'sidebarWidth') {
      throw new Error(`Invalid workspace shell key: ${key}`)
    }
  }
  const patch: WorkspaceShellUpdate = {}
  if ('sidebarCollapsed' in input) {
    patch.sidebarCollapsed = assertOptionalBoolean(input.sidebarCollapsed, 'sidebarCollapsed')
  }
  if ('sidebarWidth' in input) {
    const width = assertFiniteNumber(input.sidebarWidth, 'sidebarWidth')
    if (width <= 0 || width > MAX_SIDEBAR_WIDTH) throw new Error('Invalid sidebarWidth')
    patch.sidebarWidth = width
  }
  return patch
}

export function assertValidWorkspaceWindowPatch(value: unknown): WorkspaceWindowUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid workspace window patch')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== 'bounds' && key !== 'maximized' && key !== 'fullscreen') {
      throw new Error(`Invalid workspace window key: ${key}`)
    }
  }
  const patch: WorkspaceWindowUpdate = {}
  if ('bounds' in input) {
    patch.bounds = input.bounds === null ? null : assertValidWindowBounds(input.bounds)
  }
  if ('maximized' in input) {
    patch.maximized = assertOptionalBoolean(input.maximized, 'maximized')
  }
  if ('fullscreen' in input) {
    patch.fullscreen = assertOptionalBoolean(input.fullscreen, 'fullscreen')
  }
  return patch
}

export function assertValidWorkspaceOpenFileInput(value: unknown): WorkspaceOpenFileInput {
  const input = assertObjectWithKeys(value, ['sourcePath'], 'workspace open file input')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath)
  }
}

export function assertValidWorkspaceFocusTabInput(value: unknown): WorkspaceFocusTabInput {
  const input = assertObjectWithKeys(value, ['tabId'], 'workspace focus tab input')
  return {
    tabId: assertValidWorkspaceTabId(input.tabId)
  }
}

export function assertValidWorkspaceCloseTabInput(value: unknown): WorkspaceCloseTabInput {
  const input = assertObjectWithKeys(value, ['tabId'], 'workspace close tab input')
  return {
    tabId: assertValidWorkspaceTabId(input.tabId)
  }
}

export function assertValidWorkspaceUpdateTabViewModeInput(
  value: unknown
): WorkspaceUpdateTabViewModeInput {
  const input = assertObjectWithKeys(value, ['tabId', 'viewMode'], 'workspace tab view input')
  return {
    tabId: assertValidWorkspaceTabId(input.tabId),
    viewMode: assertValidWorkspaceViewMode(input.viewMode)
  }
}

export function assertValidWorkspaceRecordRecentInput(value: unknown): WorkspaceRecordRecentInput {
  const input = assertObjectWithKeys(value, ['sourcePath'], 'workspace recent input')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath)
  }
}

export function assertValidWorkspaceSetOutlineCollapsedInput(
  value: unknown
): WorkspaceSetOutlineCollapsedInput {
  const input = assertObjectWithKeys(value, ['sourcePath', 'collapsed'], 'workspace outline input')
  if (typeof input.collapsed !== 'boolean') throw new Error('Invalid workspace outline state')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath),
    collapsed: input.collapsed
  }
}
