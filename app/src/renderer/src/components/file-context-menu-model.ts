export type FileContextMenuAction =
  | 'copy-file'
  | 'rename'
  | 'show-in-finder'
  | 'copy-file-path'
  | 'close'
  | 'move-to-trash'

interface ContextMenuPositionInput {
  pointerX: number
  pointerY: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  margin: number
}

interface ContextMenuPosition {
  left: number
  top: number
}

/** Keep a context menu within the visible viewport. */
export function resolveContextMenuPosition(input: ContextMenuPositionInput): ContextMenuPosition {
  return {
    left: Math.max(
      input.margin,
      Math.min(input.pointerX, input.viewportWidth - input.menuWidth - input.margin)
    ),
    top: Math.max(
      input.margin,
      Math.min(input.pointerY, input.viewportHeight - input.menuHeight - input.margin)
    )
  }
}
