import { describe, expect, it } from 'vitest'

import type { FileCatalogEntry } from '../../../shared/files'
import { buildHomeSidebarModel, homeSmartGroupItemTitle } from './home-sidebar-model'

function catalogEntry(overrides: Partial<FileCatalogEntry>): FileCatalogEntry {
  return {
    sourcePath: 'plans/a.md',
    title: 'a',
    directory: 'plans',
    searchableText: 'a plans/a.md',
    pathDate: null,
    modifiedAt: '2026-05-26T12:00:00.000Z',
    modifiedAtMs: 100,
    createdAt: '2026-05-26T12:00:00.000Z',
    createdAtMs: 100,
    sizeBytes: 1,
    ...overrides
  }
}

describe('buildHomeSidebarModel', () => {
  it('builds briefing, plans, and recent groups without moving open files out of groups', () => {
    const model = buildHomeSidebarModel({
      activeTabId: 'tab-b',
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          title: 'daily-briefing',
          directory: 'sessions/2026-05-26',
          searchableText: 'daily-briefing sessions/2026-05-26/daily-briefing.md',
          createdAtMs: 500,
          modifiedAtMs: 500
        }),
        catalogEntry({
          sourcePath: 'sessions/2026-05-25/daily-briefing.md',
          title: 'daily-briefing',
          directory: 'sessions/2026-05-25',
          searchableText: 'daily-briefing sessions/2026-05-25/daily-briefing.md',
          createdAtMs: 300,
          modifiedAtMs: 300
        }),
        catalogEntry({
          sourcePath: 'plans/latest-plan.md',
          title: 'Latest Plan Title',
          searchableText: 'latest plan title plans/latest-plan.md',
          modifiedAtMs: 400
        }),
        catalogEntry({
          sourcePath: 'sessions/2026-05-25/shaping/widget-shaping.md',
          title: 'widget-shaping',
          directory: 'sessions/2026-05-25/shaping',
          searchableText: 'widget-shaping sessions/2026-05-25/shaping/widget-shaping.md',
          modifiedAtMs: 300
        })
      ],
      recents: [
        {
          sourcePath: 'plans/latest-plan.md',
          title: 'latest-plan.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        },
        {
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          title: 'daily-briefing.md',
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
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          title: 'daily-briefing.md',
          viewMode: 'source'
        }
      ]
    })

    expect(model.groups.map((group) => group.id)).toEqual(['briefing', 'plans', 'recent'])
    expect(model.groups[0]).toMatchObject({
      id: 'briefing',
      title: 'Briefing',
      headingId: 'home-briefing-heading',
      emptyLabel: 'No briefings',
      items: [
        {
          id: 'briefing:sessions/2026-05-26/daily-briefing.md',
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          active: true,
          ariaLabel: 'Open sessions/2026-05-26/daily-briefing.md'
        },
        {
          id: 'briefing:sessions/2026-05-25/daily-briefing.md',
          sourcePath: 'sessions/2026-05-25/daily-briefing.md',
          active: false,
          ariaLabel: 'Open sessions/2026-05-25/daily-briefing.md'
        }
      ]
    })
    expect(model.groups[1]?.items.map((item) => item.sourcePath)).toEqual([
      'plans/latest-plan.md',
      'sessions/2026-05-25/shaping/widget-shaping.md'
    ])
    expect(model.groups[2]?.items.map((item) => item.sourcePath)).toEqual([
      'plans/latest-plan.md',
      'sessions/2026-05-26/daily-briefing.md',
      'reviews/pr-678-review.md'
    ])
    expect(model.groups[2]?.items[0]?.title).toBe('Latest Plan Title')
  })

  it('falls back to file names when persisted titles are blank', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'briefings/daily-briefing.md',
          title: '',
          searchableText: 'briefings/daily-briefing.md',
          createdAtMs: 300
        }),
        catalogEntry({
          sourcePath: 'plans/catalog-plan.md',
          title: '',
          searchableText: 'plans/catalog-plan.md',
          modifiedAtMs: 200
        })
      ],
      recents: [
        {
          sourcePath: 'docs/overview.md',
          title: '  ',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: []
    })

    expect(model.groups[0]?.items[0]?.title).toBe('daily-briefing.md')
    expect(model.groups[1]?.items[0]?.title).toBe('catalog-plan.md')
    expect(model.groups[2]?.items[0]?.title).toBe('overview.md')
  })

  it('ranks plans by recent activity before modified time and caps at 10 items', () => {
    const catalogFiles = Array.from({ length: 12 }, (_, index) =>
      catalogEntry({
        sourcePath: `plans/plan-${index}.md`,
        title: `plan-${index}`,
        searchableText: `plan-${index} plans/plan-${index}.md`,
        modifiedAtMs: index
      })
    )

    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles,
      recents: [
        {
          sourcePath: 'plans/plan-2.md',
          title: 'plan-2.md',
          openedAt: '2026-05-26T13:00:00.000Z'
        },
        {
          sourcePath: 'plans/plan-1.md',
          title: 'plan-1.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: []
    })

    const plans = model.groups.find((group) => group.id === 'plans')
    expect(plans?.items).toHaveLength(10)
    expect(plans?.items.map((item) => item.sourcePath).slice(0, 3)).toEqual([
      'plans/plan-2.md',
      'plans/plan-1.md',
      'plans/plan-11.md'
    ])
  })

  it('matches plan, planning, shaping, and breadboard tokens from catalog searchable text', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/brief.md',
          title: 'brief',
          searchableText: 'brief sessions/brief.md'
        }),
        catalogEntry({
          sourcePath: 'planning/work.md',
          title: 'work',
          searchableText: 'work planning/work.md',
          modifiedAtMs: 200
        }),
        catalogEntry({
          sourcePath: 'docs/explanation.md',
          title: 'explanation',
          searchableText: 'explanation docs/explanation.md',
          modifiedAtMs: 500
        }),
        catalogEntry({
          sourcePath: 'sessions/shaping/widget.md',
          title: 'widget',
          searchableText: 'widget sessions/shaping/widget.md',
          modifiedAtMs: 300
        }),
        catalogEntry({
          sourcePath: 'sessions/breadboard/widget.md',
          title: 'widget',
          searchableText: 'widget sessions/breadboard/widget.md',
          modifiedAtMs: 400
        })
      ],
      recents: [],
      tabs: []
    })

    expect(
      model.groups.find((group) => group.id === 'plans')?.items.map((item) => item.sourcePath)
    ).toEqual(['sessions/breadboard/widget.md', 'sessions/shaping/widget.md', 'planning/work.md'])
  })

  it('ranks briefings by parsed path date before filesystem timestamps', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/2026-06-01/briefing-2026-06-01.md',
          title: 'briefing-2026-06-01',
          searchableText: 'briefing 2026 06 01 sessions/2026-06-01/briefing-2026-06-01.md',
          pathDate: '2026-06-01',
          createdAtMs: 900
        }),
        catalogEntry({
          sourcePath: 'sessions/2026-06-22/briefing-2026-06-22.md',
          title: 'briefing-2026-06-22',
          searchableText: 'briefing 2026 06 22 sessions/2026-06-22/briefing-2026-06-22.md',
          pathDate: '2026-06-22',
          createdAtMs: 100
        })
      ],
      recents: [],
      tabs: []
    })

    expect(model.groups[0]?.items.map((item) => item.sourcePath)).toEqual([
      'sessions/2026-06-22/briefing-2026-06-22.md',
      'sessions/2026-06-01/briefing-2026-06-01.md'
    ])
  })

  it('formats briefing row titles as the distinctive date', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/2026-06-22/briefing-2026-06-22.md',
          title: 'briefing-2026-06-22',
          searchableText: 'briefing-2026-06-22 sessions/2026-06-22/briefing-2026-06-22.md'
        })
      ],
      recents: [],
      tabs: []
    })
    const briefingItem = model.groups[0]?.items[0]

    expect(briefingItem).toBeDefined()
    expect(homeSmartGroupItemTitle(briefingItem!)).toBe('2026-06-22')
    expect(
      homeSmartGroupItemTitle(briefingItem!, 'Morning Briefing -- Monday, June 22, 2026')
    ).toBe('Monday, June 22, 2026')
    expect(
      homeSmartGroupItemTitle(briefingItem!, 'Morning Briefing \u2014 Monday, June 22, 2026')
    ).toBe('Monday, June 22, 2026')
  })
})
