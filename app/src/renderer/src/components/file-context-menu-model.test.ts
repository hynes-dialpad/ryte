import { describe, expect, it } from 'vitest'

import { resolveContextMenuPosition } from './file-context-menu-model'

describe('resolveContextMenuPosition', () => {
  it.each([
    {
      name: 'keeps a pointer position that already fits',
      pointer: { x: 120, y: 80 },
      expected: { left: 120, top: 80 }
    },
    {
      name: 'keeps the menu inside the bottom-right viewport edge',
      pointer: { x: 790, y: 590 },
      expected: { left: 592, top: 332 }
    },
    {
      name: 'keeps the menu inside the top-left viewport edge',
      pointer: { x: -10, y: -20 },
      expected: { left: 8, top: 8 }
    }
  ])('$name', ({ pointer, expected }) => {
    expect(
      resolveContextMenuPosition({
        pointerX: pointer.x,
        pointerY: pointer.y,
        menuWidth: 200,
        menuHeight: 260,
        viewportWidth: 800,
        viewportHeight: 600,
        margin: 8
      })
    ).toEqual(expected)
  })
})
