import { app } from 'electron'
import { join } from 'node:path'

export function userDataDir(): string {
  return app.getPath('userData')
}

export function settingsFilePath(): string {
  return join(userDataDir(), 'settings.json')
}

export function indexDbPath(): string {
  return join(userDataDir(), 'index.db')
}

export function defaultNotesRoot(): string {
  return join(app.getPath('home'), 'notes')
}
