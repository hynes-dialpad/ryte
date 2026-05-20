import { describe, expect, it } from 'vitest'

import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  shouldAutoCollapseSidebar
} from './workspace'

describe('workspace shell policy', () => {
  it('keeps a 360px default sidebar within normal desktop bounds', () => {
    expect(clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH, 1460)).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('clamps sidebar width to the drag minimum', () => {
    expect(clampSidebarWidth(12, 1460)).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('caps sidebar width at half the viewport', () => {
    expect(clampSidebarWidth(900, 1280)).toBe(640)
  })

  it('auto-collapses below the small viewport threshold', () => {
    expect(shouldAutoCollapseSidebar(639)).toBe(true)
    expect(shouldAutoCollapseSidebar(640)).toBe(false)
  })
})
