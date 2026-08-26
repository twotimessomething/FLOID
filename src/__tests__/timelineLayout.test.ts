import { describe, it, expect } from 'vitest';
import type { Section, TimelineItem, ViewportBounds } from '../types';
import {
  NESTED_ROW_HEIGHT,
  ROW_HEIGHT,
  calculateSectionHeight,
  dayToX,
  flattenSection,
  getBarRect,
  headerMilestones,
  resolveItemColor,
  tapeStrips,
  xToDay,
} from '../utils/timelineUtils';
import { computeViewportBounds } from '../utils/dateUtils';

function bar(id: string, children: TimelineItem[] = [], isCollapsed = false): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start: '2026-01-01',
    end: '2026-02-01',
    color: null,
    isCollapsed,
    children,
  };
}

function milestone(id: string, day = '2026-01-15'): TimelineItem {
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

function section(items: TimelineItem[], overrides: Partial<Section> = {}): Section {
  return {
    id: 's',
    name: 'S',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#3a3f76',
    isCollapsed: false,
    ...overrides,
  };
}

describe('flattenSection', () => {
  it('keeps root milestones out of the rows — they print on the schedule row', () => {
    const rows = flattenSection(section([bar('a'), milestone('m'), bar('b')]));
    expect(rows.map((r) => r.item.id)).toEqual(['a', 'b']);
    expect(headerMilestones(section([bar('a'), milestone('m')])).map((i) => i.id)).toEqual(['m']);
  });

  it('gives a nested milestone a row of its own', () => {
    const rows = flattenSection(section([bar('a', [milestone('am')])]));
    expect(rows.map((r) => r.item.id)).toEqual(['a', 'am']);
    expect(rows[1].depth).toBe(1);
  });

  it('stacks rows by their own height', () => {
    const rows = flattenSection(section([bar('a', [bar('a1'), bar('a2')]), bar('b')]));
    expect(rows.map((r) => [r.item.id, r.depth, r.top, r.height])).toEqual([
      ['a', 0, 0, ROW_HEIGHT],
      ['a1', 1, ROW_HEIGHT, NESTED_ROW_HEIGHT],
      ['a2', 1, ROW_HEIGHT + NESTED_ROW_HEIGHT, NESTED_ROW_HEIGHT],
      ['b', 0, ROW_HEIGHT + NESTED_ROW_HEIGHT * 2, ROW_HEIGHT],
    ]);
  });

  it('hides the children of a collapsed bar', () => {
    const rows = flattenSection(section([bar('a', [bar('a1')], true), bar('b')]));
    expect(rows.map((r) => r.item.id)).toEqual(['a', 'b']);
  });

  it('renders nothing for a collapsed schedule', () => {
    expect(flattenSection(section([bar('a')], { isCollapsed: true }))).toEqual([]);
  });

  it('reports each row the sibling slot it occupies', () => {
    const rows = flattenSection(section([bar('a'), milestone('m'), bar('b')]));
    // Slot indices are positions in the real array, milestone included, so a
    // drop resolved from a row lands where the row actually sits.
    expect(rows.map((r) => r.index)).toEqual([0, 2]);
    expect(rows.map((r) => r.siblingCount)).toEqual([3, 3]);
  });

  it('marks the last sibling that actually draws a row', () => {
    // "b" is last in the array but "a" is the last one with a row, so "a" is
    // what hosts the trailing drop slot.
    const rows = flattenSection(section([bar('a'), milestone('m')]));
    expect(rows.map((r) => [r.item.id, r.isLastRenderedSibling])).toEqual([['a', true]]);
  });

  it('inherits colour down the tree so a group reads as one block', () => {
    const rows = flattenSection(
      section([{ ...bar('a', [bar('a1')]), color: '#ff0000' }])
    );
    expect(rows[0].color).toBe('#ff0000');
    expect(rows[1].color).toBe('#ff0000');
  });

  it('carries a lock down to everything underneath it', () => {
    const rows = flattenSection(section([{ ...bar('a', [bar('a1')]), isLocked: true }]));
    expect(rows.map((r) => r.isLocked)).toEqual([true, true]);
    expect(flattenSection(section([bar('a', [bar('a1')])], { isLocked: true })).every((r) => r.isLocked)).toBe(true);
  });

  it('measures a schedule as its header plus its rows plus room to draw', () => {
    const one = calculateSectionHeight(section([bar('a')]));
    const two = calculateSectionHeight(section([bar('a', [bar('a1')])]));
    expect(two - one).toBe(NESTED_ROW_HEIGHT);
    expect(calculateSectionHeight(section([], { isCollapsed: true }))).toBe(ROW_HEIGHT);
  });
});

describe('day and pixel geometry', () => {
  const viewport: ViewportBounds = computeViewportBounds([section([bar('a')])]);

  it('maps a day to a pixel and back with no drift', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(xToDay(dayToX(day, viewport, 6), viewport, 6)).toBe(day);
    }
  });

  it('sizes a bar from its own two dates', () => {
    const item = { ...bar('a'), start: '2026-03-01', end: '2026-03-11' };
    const rect = getBarRect(item, viewport, 6);
    expect(rect.width).toBe(60);
    expect(rect.left).toBe(dayToX('2026-03-01', viewport, 6));
  });

  it('gives a milestone no width', () => {
    expect(getBarRect(milestone('m'), viewport, 6).width).toBe(0);
  });

  it('keeps a one-day bar wide enough to grab', () => {
    const item = { ...bar('a'), start: '2026-03-01', end: '2026-03-02' };
    // 1 day at quarter zoom is 2px, which no cursor could hit
    expect(getBarRect(item, viewport, 2).width).toBeGreaterThanOrEqual(6);
  });

  it('pads the viewport a month past everything, so there is somewhere to drag to', () => {
    const bounds = computeViewportBounds([
      section([{ ...bar('a'), start: '2026-05-01', end: '2026-06-01' }], {
        startDate: '2026-05-01',
        endDate: '2026-06-01',
      }),
    ]);
    expect(bounds.startKey).toBe('2026-04-01');
    expect(bounds.endKey).toBe('2026-07-01');
  });

  it('widens the viewport for an item dragged outside its schedule window', () => {
    const bounds = computeViewportBounds([
      section([{ ...bar('a'), start: '2025-11-01', end: '2025-12-01' }], {
        startDate: '2026-05-01',
        endDate: '2026-06-01',
      }),
    ]);
    expect(bounds.startKey).toBe('2025-10-01');
  });
});

describe('colour inheritance', () => {
  const multicolor = (items: TimelineItem[]): Section =>
    section(items, { isMulticolor: true, color: '#3a3f76' });

  it('resolves a root bar from the schedule palette rather than a stored colour', () => {
    const rows = flattenSection(multicolor([bar('a'), bar('b')]));
    expect(rows[0].item.color).toBeNull();
    expect(rows[0].color).not.toBe(rows[1].color);
    expect(rows[0].color).toMatch(/^#/);
  });

  it('paints a nested bar in its parent colour so the group reads as one block', () => {
    const rows = flattenSection(multicolor([bar('a', [bar('a1', [bar('a2')])]), bar('b')]));
    expect(rows[1].color).toBe(rows[0].color);
    expect(rows[2].color).toBe(rows[0].color);
    expect(rows[3].color).not.toBe(rows[0].color);
  });

  it('lets a deliberate colour override the inheritance at any depth', () => {
    const rows = flattenSection(
      multicolor([bar('a', [{ ...bar('a1', [bar('a2')]), color: '#ff0000' }])])
    );
    expect(rows[1].color).toBe('#ff0000');
    // …and everything under it inherits the override, not the grandparent
    expect(rows[2].color).toBe('#ff0000');
  });

  it('reflows the palette when root bars are reordered', () => {
    const before = flattenSection(multicolor([bar('a'), bar('b')]));
    const after = flattenSection(multicolor([bar('b'), bar('a')]));
    // Colour comes from the slot, not from the bar, so swapping swaps the ink
    expect(after[0].color).toBe(before[0].color);
    expect(after[1].color).toBe(before[1].color);
  });

  it('resolves a single item off the timeline the same way a row does', () => {
    const built = multicolor([bar('a', [bar('a1')]), bar('b')]);
    const rows = flattenSection(built);
    expect(resolveItemColor(built, 'a1')).toBe(rows[1].color);
    expect(resolveItemColor(built, 'b')).toBe(rows[2].color);
  });

  it('resolves an item inside a collapsed bar, which has no row to read from', () => {
    const built = multicolor([bar('a', [bar('a1')], true)]);
    expect(flattenSection(built).map((r) => r.item.id)).toEqual(['a']);
    expect(resolveItemColor(built, 'a1')).toBe(resolveItemColor(built, 'a'));
  });
});

describe('the collapsed tape', () => {
  const span = (id: string, start: string, end: string): TimelineItem => ({
    ...bar(id),
    start,
    end,
  });

  const ids = (built: Section): string[] => tapeStrips(built).map((s) => s.item.id);

  it('lays the strips down in date order, whatever order they sit in', () => {
    const built = section([
      span('c', '2026-05-01', '2026-07-01'),
      span('a', '2026-01-01', '2026-03-01'),
      span('b', '2026-02-01', '2026-06-01'),
    ]);
    // Last laid is last painted, so a run of work reads left to right
    expect(ids(built)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a bar drawn inside another one on top of it', () => {
    const built = section([
      span('inner', '2026-02-01', '2026-03-01'),
      span('outer', '2026-01-01', '2026-12-01'),
    ]);
    expect(ids(built)).toEqual(['outer', 'inner']);
  });

  it('puts the longer of two bars that start together underneath', () => {
    const built = section([
      span('short', '2026-01-01', '2026-02-01'),
      span('long', '2026-01-01', '2026-09-01'),
    ]);
    expect(ids(built)).toEqual(['long', 'short']);
  });

  it('marks the day a strip is covered from, and leaves an untouched one alone', () => {
    const strips = tapeStrips(
      section([
        span('a', '2026-01-01', '2026-04-01'),
        span('b', '2026-03-01', '2026-06-01'),
        span('c', '2026-08-01', '2026-09-01'),
      ])
    );
    // 'a' loses its last month to 'b'
    expect(strips[0].coveredFrom).toBe('2026-03-01');
    // 'b' ends before 'c' starts, so nothing lands on it
    expect(strips[1].coveredFrom).toBeNull();
    expect(strips[2].coveredFrom).toBeNull();
  });

  it("keys colour to the bar's slot in the schedule, not to the paint order", () => {
    const built = section(
      [span('late', '2026-06-01', '2026-08-01'), span('early', '2026-01-01', '2026-03-01')],
      { isMulticolor: true }
    );
    const rows = flattenSection(built);
    const strips = tapeStrips(built);
    expect(strips.map((s) => s.item.id)).toEqual(['early', 'late']);
    expect(strips[0].color).toBe(rows[1].color);
    expect(strips[1].color).toBe(rows[0].color);
  });
});
