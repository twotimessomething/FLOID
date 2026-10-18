import { describe, it, expect } from 'vitest';
import type { Section, TimelineItem } from '../types';
import {
  computeItemPoints,
  parseRoute,
  pathThrough,
  routeConnector,
  routePoints,
} from '../utils/dependencyGeometry';
import {
  CREATE_ROW_HEIGHT,
  NESTED_ROW_HEIGHT,
  ROW_HEIGHT,
  SECTION_HAIRLINE,
} from '../utils/timelineUtils';

function bar(id: string, start: string, end: string, children: TimelineItem[] = []): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start,
    end,
    color: null,
    isCollapsed: false,
    children,
  };
}

function milestone(id: string, day: string): TimelineItem {
  return {
    id,
    kind: 'milestone',
    name: id,
    description: '',
    start: day,
    end: day,
    color: null,
    isCollapsed: false,
    children: [],
  };
}

function section(id: string, items: TimelineItem[], overrides: Partial<Section> = {}): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#333333',
    isCollapsed: false,
    ...overrides,
  };
}

describe('computeItemPoints', () => {
  it('centres every item on the same rows flattenSection draws', () => {
    const sections = [
      section('s1', [bar('a', '2026-01-01', '2026-02-01'), bar('b', '2026-02-01', '2026-03-01')]),
    ];
    const points = computeItemPoints(sections);
    expect(points.get('a')?.y).toBe(SECTION_HAIRLINE + ROW_HEIGHT + ROW_HEIGHT / 2);
    expect(points.get('b')?.y).toBe(SECTION_HAIRLINE + ROW_HEIGHT + ROW_HEIGHT + ROW_HEIGHT / 2);
  });

  it('puts root milestones on the schedule header row', () => {
    const points = computeItemPoints([section('s1', [milestone('m', '2026-01-15')])]);
    expect(points.get('m')?.y).toBe(SECTION_HAIRLINE + ROW_HEIGHT / 2);
  });

  it('anchors an item folded inside a collapsed group to the group bar row', () => {
    const group = bar('g', '2026-01-01', '2026-02-01', [bar('g1', '2026-01-05', '2026-01-10')]);
    group.isCollapsed = true;
    const points = computeItemPoints([section('s1', [group])]);
    expect(points.get('g1')?.y).toBe(points.get('g')?.y);
  });

  it('folds a collapsed schedule onto its own header row', () => {
    const points = computeItemPoints([
      section('s1', [bar('a', '2026-01-01', '2026-02-01')], { isCollapsed: true }),
    ]);
    expect(points.get('a')?.y).toBe(SECTION_HAIRLINE + ROW_HEIGHT / 2);
  });

  it('stacks sections the way the sheet does', () => {
    const sections = [
      section('s1', [bar('a', '2026-01-01', '2026-02-01')]),
      section('s2', [bar('x', '2026-01-01', '2026-02-01')]),
    ];
    const points = computeItemPoints(sections);
    const s1Height = ROW_HEIGHT + ROW_HEIGHT + CREATE_ROW_HEIGHT;
    // SectionRow prints every schedule under a hairline, so each one on the
    // stack — this schedule included — sits a pixel lower than its rows alone
    expect(points.get('x')?.y).toBe(
      2 * SECTION_HAIRLINE + s1Height + ROW_HEIGHT + ROW_HEIGHT / 2
    );
  });

  it('counts one hairline per schedule, so drift cannot accumulate', () => {
    const sections = Array.from({ length: 5 }, (_, i) =>
      section(`s${i}`, [bar(`b${i}`, '2026-01-01', '2026-02-01')], { isCollapsed: true })
    );
    const points = computeItemPoints(sections);
    const stride = SECTION_HAIRLINE + ROW_HEIGHT;
    expect(points.get('b4')?.y).toBe(4 * stride + SECTION_HAIRLINE + ROW_HEIGHT / 2);
  });

  it('gives nested rows their shallower height', () => {
    const sections = [
      section('s1', [
        bar('g', '2026-01-01', '2026-02-01', [bar('g1', '2026-01-05', '2026-01-10')]),
      ]),
    ];
    const points = computeItemPoints(sections);
    expect(points.get('g1')?.y).toBe(
      SECTION_HAIRLINE + ROW_HEIGHT + ROW_HEIGHT + NESTED_ROW_HEIGHT / 2
    );
  });
});

describe('routeConnector', () => {
  it('draws a straight line for a forward finish-to-start on one row', () => {
    const path = routeConnector({ x: 0, y: 10, away: 1 }, { x: 100, y: 10, away: -1 });
    expect(path).toBe('M 0 10 L 100 10');
  });

  it('takes three segments when the approach lands from the arrow side', () => {
    const path = routeConnector({ x: 0, y: 10, away: 1 }, { x: 100, y: 50, away: -1 });
    expect(path).toBe('M 0 10 L 10 10 L 10 50 L 100 50');
  });

  it('doubles back in five segments when the target sits behind the source', () => {
    const path = routeConnector({ x: 100, y: 10, away: 1 }, { x: 0, y: 50, away: -1 });
    // out right, drop to the midline, run back, drop again, arrive from the left
    expect(path).toBe('M 100 10 L 110 10 L 110 30 L -10 30 L -10 50 L 0 50');
  });

  it('routes below the row when both ends share it but the line cannot run straight', () => {
    const path = routeConnector({ x: 100, y: 10, away: 1 }, { x: 0, y: 10, away: -1 });
    expect(path.split('L')).toHaveLength(6);
    expect(path).toContain(' 26'); // the clearance line under the row
  });
});

describe('routePoints', () => {
  const cases: Array<[string, Parameters<typeof routePoints>]> = [
    ['straight', [{ x: 0, y: 10, away: 1 }, { x: 100, y: 10, away: -1 }]],
    ['three segments', [{ x: 0, y: 10, away: 1 }, { x: 100, y: 50, away: -1 }]],
    ['doubling back', [{ x: 100, y: 10, away: 1 }, { x: 0, y: 50, away: -1 }]],
    ['same row, wrong way', [{ x: 100, y: 10, away: 1 }, { x: 0, y: 10, away: -1 }]],
  ];

  it.each(cases)('is the corners routeConnector draws (%s)', (_, [from, to]) => {
    expect(pathThrough(routePoints(from, to))).toBe(routeConnector(from, to));
  });

  it('runs from the from terminal to the to terminal', () => {
    const points = routePoints({ x: 100, y: 10, away: 1 }, { x: 0, y: 50, away: -1 });
    expect(points[0]).toEqual({ x: 100, y: 10 });
    expect(points[points.length - 1]).toEqual({ x: 0, y: 50 });
  });

  it('turns only square corners', () => {
    const points = routePoints({ x: 100, y: 10, away: 1 }, { x: 0, y: 50, away: -1 });
    for (let i = 1; i < points.length; i += 1) {
      const horizontal = points[i].y === points[i - 1].y;
      const vertical = points[i].x === points[i - 1].x;
      expect(horizontal || vertical).toBe(true);
    }
  });
});

describe('parseRoute', () => {
  it('reads back exactly what pathThrough wrote, fractions and negatives included', () => {
    const points = [
      { x: -10.5, y: 30 },
      { x: 110.25, y: 30 },
      { x: 110.25, y: 1e-7 },
      { x: 0, y: 50.125 },
    ];
    expect(parseRoute(pathThrough(points))).toEqual(points);
  });

  it('reads a route the layer printed', () => {
    const d = routeConnector({ x: 100, y: 10, away: 1 }, { x: 0, y: 50, away: -1 });
    expect(parseRoute(d)).toEqual(
      routePoints({ x: 100, y: 10, away: 1 }, { x: 0, y: 50, away: -1 })
    );
  });

  it('gives nothing for an empty path', () => {
    expect(parseRoute('')).toEqual([]);
  });
});
