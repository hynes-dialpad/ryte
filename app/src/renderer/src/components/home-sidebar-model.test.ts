import { describe, expect, it } from 'vitest'

import { buildHomeSidebarModel } from './home-sidebar-model'

describe('buildHomeSidebarModel', () => {
  it('builds recent and open groups from workspace state', () => {
    const model = buildHomeSidebarModel({
      activeTabId: 'tab-b',
      recents: [
        {
          sourcePath: 'plans/latest-plan.md',
          title: 'latest-plan.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        },
        {
          sourcePath: 'sessions/2026-05-26/briefing.md',
          title: 'briefing.md',
          openedAt: '2026-05-26T11:00:00.000Z'
        }
      ],
      tabs: [
        {
          id: 'tab-a',
          sourcePath: 'plans/latest-plan.md',
          title: 'latest-plan.md',
          viewMode: 'preview'
        },
        {
          id: 'tab-b',
          sourcePath: 'sessions/2026-05-26/briefing.md',
          title: 'briefing.md',
          viewMode: 'source'
        }
      ]
    })

    expect(model.recentItems).toEqual([
      {
        kind: 'recent',
        id: 'recent:plans/latest-plan.md',
        sourcePath: 'plans/latest-plan.md',
        title: 'latest-plan.md',
        active: false
      },
      {
        kind: 'recent',
        id: 'recent:sessions/2026-05-26/briefing.md',
        sourcePath: 'sessions/2026-05-26/briefing.md',
        title: 'briefing.md',
        active: true
      }
    ])
    expect(model.openItems).toEqual([
      {
        kind: 'open',
        id: 'open:tab-a',
        tabId: 'tab-a',
        sourcePath: 'plans/latest-plan.md',
        title: 'latest-plan.md',
        active: false
      },
      {
        kind: 'open',
        id: 'open:tab-b',
        tabId: 'tab-b',
        sourcePath: 'sessions/2026-05-26/briefing.md',
        title: 'briefing.md',
        active: true
      }
    ])
  })

  it('falls back to file names when persisted titles are blank', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      recents: [
        {
          sourcePath: 'docs/overview.md',
          title: '  ',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: [
        {
          id: 'tab-a',
          sourcePath: 'research/notes.md',
          title: '',
          viewMode: 'preview'
        }
      ]
    })

    expect(model.recentItems[0]?.title).toBe('overview.md')
    expect(model.openItems[0]?.title).toBe('notes.md')
  })
})
