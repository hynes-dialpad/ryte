import { describe, expect, it } from 'vitest'

import { buildHomeSidebarModel } from './home-sidebar-model'

describe('buildHomeSidebarModel', () => {
  it('builds open and recent groups from workspace state', () => {
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
        },
        {
          sourcePath: 'reviews/pr-678-review.md',
          title: 'pr-678-review.md',
          openedAt: '2026-05-26T10:00:00.000Z'
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

    expect(model.groups).toEqual([
      {
        id: 'open',
        title: 'Open',
        headingId: 'home-open-heading',
        emptyLabel: 'No open files',
        items: [
          {
            id: 'open:tab-a',
            sourcePath: 'plans/latest-plan.md',
            title: 'latest-plan.md',
            active: false,
            ariaLabel: 'Focus plans/latest-plan.md',
            action: {
              kind: 'focus-tab',
              tabId: 'tab-a'
            }
          },
          {
            id: 'open:tab-b',
            sourcePath: 'sessions/2026-05-26/briefing.md',
            title: 'briefing.md',
            active: true,
            ariaLabel: 'Focus sessions/2026-05-26/briefing.md',
            action: {
              kind: 'focus-tab',
              tabId: 'tab-b'
            }
          }
        ]
      },
      {
        id: 'recent',
        title: 'Recent',
        headingId: 'home-recent-heading',
        emptyLabel: 'No recent files',
        items: [
          {
            id: 'recent:reviews/pr-678-review.md',
            sourcePath: 'reviews/pr-678-review.md',
            title: 'pr-678-review.md',
            active: false,
            ariaLabel: 'Open reviews/pr-678-review.md',
            action: {
              kind: 'open-explicit-file',
              sourcePath: 'reviews/pr-678-review.md'
            }
          }
        ]
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

    expect(model.groups[0]?.items[0]?.title).toBe('notes.md')
    expect(model.groups[1]?.items[0]?.title).toBe('overview.md')
  })
})
