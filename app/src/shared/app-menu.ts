import type { WorkspaceOpenRecentFileInput, WorkspaceSidebarMode } from './workspace'

export const APP_MENU_COMMAND_CHANNEL = 'app-menu:command'

export type AppMenuCommand =
  | { type: 'open-native-file' }
  | { type: 'open-source-path'; sourcePath: string }
  | { type: 'open-recent-file'; file: WorkspaceOpenRecentFileInput }
  | { type: 'close-active-tab' }
  | { type: 'close-all-tabs' }
  | { type: 'focus-next-tab' }
  | { type: 'focus-previous-tab' }
  | { type: 'select-sidebar'; sidebar: WorkspaceSidebarMode }
  | { type: 'toggle-sidebar' }
  | { type: 'open-settings' }
