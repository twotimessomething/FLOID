import { describe, it, expect } from 'vitest';
import type { Section, TimelineItem } from '../types';
import { flattenSection, rootAppendRange } from '../utils/timelineUtils';
import {
  CLUSTER_COMPRESSION,
  CLUSTER_SOFT_LIMIT_PX,
  compressCluster,
  settleDuration,
} from '../utils/dragCluster';
import { cubicBezier, easeOut } from '../utils/easing';
import {
  dayDeltaForDrop,
  dropIndicatorKey,
  edgeScrollSpeedY,
  isNoOpSlot,
  stayRange,
  type DragOrigin,
} from '../hooks/useItemDrag';
import { insertionIndex, reorderIndices } from '../hooks/useScheduleDrag';

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

function milestone(id: string): TimelineItem {
  return { ...bar(id), kind: 'milestone', end: '2026-01-01' };
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

describe('easing', () => {
  it('is the CSS curve: pinned at both ends and monotonic', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    let previous = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const value = easeOut(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('starts fast, as an ease-out must', () => {
    expect(easeOut(0.2)).toBeGreaterThan(0.5);
  });

  it('agrees with a linear curve written as a bezier', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.37)).toBeCloseTo(0.37, 4);
  });
});

describe('compressCluster', () => {
  it('leaves the leader where it is', () => {
    const [leader] = compressCluster([{ top: 0, height: 32 }], 'plot');
    expect(leader).toEqual({ top: 0, height: 32, opacity: 1 });
  });

  it('draws members in towards the leader on the sheet, keeping their own height', () => {
    // A root bar (32px) with a nested child 46px below its top (18px tall)
    const [, child] = compressCluster(
      [
        { top: 0, height: 32 },
        { top: 46, height: 18 },
      ],
      'plot'
    );
    expect(child.height).toBe(18);
    const centreGap = (46 + 9 - 16) * CLUSTER_COMPRESSION;
    expect(child.top).toBeCloseTo(16 + centreGap - 9, 6);
    expect(child.top).toBeLessThan(46);
    // Still clear of the leader: drawn in, not stacked on top of it
    expect(child.top).toBeGreaterThan(32);
  });

  it('stacks label rows edge to edge, each a little shallower', () => {
    const held = compressCluster(
      [
        { top: 0, height: 48 },
        { top: 48, height: 30 },
        { top: 78, height: 30 },
      ],
      'labels'
    );
    expect(held[1].top).toBe(48);
    expect(held[1].height).toBeCloseTo(30 * CLUSTER_COMPRESSION, 6);
    expect(held[2].top).toBeCloseTo(held[1].top + held[1].height, 6);
  });

  it('folds a deep group into a tight tail past the soft limit', () => {
    const members = Array.from({ length: 40 }, (_, i) => ({ top: i * 30, height: 18 }));
    const held = compressCluster(members, 'plot');
    const last = held[held.length - 1];
    expect(last.top).toBeLessThan(CLUSTER_SOFT_LIMIT_PX + 200);
    expect(last.opacity).toBeLessThan(1);
    // Order survives the fold
    for (let i = 2; i < held.length; i += 1) expect(held[i].top).toBeGreaterThan(held[i - 1].top);
  });
});

describe('settleDuration', () => {
  it('never drops under the base or over the ceiling', () => {
    expect(settleDuration(0)).toBe(220);
    expect(settleDuration(10_000)).toBe(340);
    expect(settleDuration(300)).toBeGreaterThan(220);
  });
});

describe('dayDeltaForDrop', () => {
  it('ignores sideways wobble while re-ordering, even at a coarse zoom', () => {
    const slot = { kind: 'slot', sectionId: 's', parentId: null, index: 0 } as const;
    expect(dayDeltaForDrop(slot, 5, 2)).toBe(0);
    expect(dayDeltaForDrop(slot, 12, 2)).toBe(6);
  });

  it('never moves dates for a drop into a group or a drag from the labels', () => {
    expect(dayDeltaForDrop({ kind: 'into', sectionId: 's', parentId: 'p' }, 400, 6)).toBe(0);
    expect(dayDeltaForDrop(null, 400, 0)).toBe(0);
  });
});

describe('drop indicators', () => {
  const origin: DragOrigin = { sectionId: 's', parentId: null, index: 2 };

  it('treats the slot before and after the item itself as staying put', () => {
    expect(isNoOpSlot({ kind: 'slot', sectionId: 's', parentId: null, index: 2 }, origin)).toBe(true);
    expect(isNoOpSlot({ kind: 'slot', sectionId: 's', parentId: null, index: 3 }, origin)).toBe(true);
    expect(isNoOpSlot({ kind: 'slot', sectionId: 's', parentId: null, index: 4 }, origin)).toBe(false);
    expect(isNoOpSlot({ kind: 'slot', sectionId: 't', parentId: null, index: 2 }, origin)).toBe(false);
  });

  it('treats a drop onto the group it is already in as staying put', () => {
    const nested: DragOrigin = { sectionId: 's', parentId: 'g', index: 0 };
    expect(isNoOpSlot({ kind: 'into', sectionId: 's', parentId: 'g' }, nested)).toBe(true);
    expect(isNoOpSlot({ kind: 'into', sectionId: 's', parentId: 'h' }, nested)).toBe(false);
  });

  it('counts the slots across rowless root milestones as staying put', () => {
    // [bar a, milestone m, bar b]: dragging b, the slot before m is still "here"
    const siblings = [bar('a'), milestone('m'), bar('b')];
    const range = stayRange(siblings, 2, true);
    expect(range).toEqual({ stayFrom: 1, stayTo: 3 });
    const origin: DragOrigin = { sectionId: 's', parentId: null, index: 2, ...range };
    expect(isNoOpSlot({ kind: 'slot', sectionId: 's', parentId: null, index: 1 }, origin)).toBe(true);
    expect(isNoOpSlot({ kind: 'slot', sectionId: 's', parentId: null, index: 0 }, origin)).toBe(false);
    // Nested lists have no rowless members
    expect(stayRange(siblings, 2, false)).toEqual({ stayFrom: 2, stayTo: 3 });
  });

  it('shows nothing for a no-op slot', () => {
    const target = { kind: 'slot', sectionId: 's', parentId: null, index: 3 } as const;
    expect(dropIndicatorKey({ target, surface: 'row' }, 'bar', origin)).toBeNull();
  });

  it('sends a milestone headed for the root to the schedule row', () => {
    const target = { kind: 'slot', sectionId: 's', parentId: null, index: 0 } as const;
    expect(dropIndicatorKey({ target, surface: 'row' }, 'milestone', origin)).toBe('header:s');
    expect(dropIndicatorKey({ target, surface: 'row' }, 'task', origin)).toBe('slot:s:root:0');
  });

  it('lights the schedule row for a folded schedule or a held band', () => {
    const target = { kind: 'slot', sectionId: 't', parentId: null, index: 0 } as const;
    expect(dropIndicatorKey({ target, surface: 'band' }, 'bar', origin)).toBe('header:t');
    expect(dropIndicatorKey({ target, surface: 'folded-header' }, 'bar', origin)).toBe('header:t');
    expect(dropIndicatorKey({ target, surface: 'header' }, 'bar', origin)).toBe('slot:t:root:0');
  });
});

describe('flattenSection drop slots', () => {
  it('gives the first row after root milestones the slots they cannot mark', () => {
    const rows = flattenSection(section([milestone('m1'), milestone('m2'), bar('a'), bar('b')]));
    expect(rows.map((row) => [row.item.id, row.slotFrom, row.index])).toEqual([
      ['a', 0, 2],
      ['b', 3, 3],
    ]);
  });

  it('closes a group on its last descendant row, not on the group row', () => {
    const rows = flattenSection(section([bar('g', [bar('c1'), bar('c2', [bar('gc')])]), bar('z')]));
    const byId = new Map(rows.map((row) => [row.item.id, row]));
    expect(byId.get('g')?.closes).toEqual([]);
    expect(byId.get('c2')?.closes).toEqual([]);
    // gc closes c2's list (depth 2) and then g's list (depth 1), innermost first
    expect(byId.get('gc')?.closes).toEqual([
      { parentId: 'c2', from: 1, to: 1, depth: 2 },
      { parentId: 'g', from: 2, to: 2, depth: 1 },
    ]);
  });

  it('marks lists a lock has closed to newcomers', () => {
    const rows = flattenSection(section([bar('a', [bar('b')])], { isLocked: true }));
    expect(rows.every((row) => row.parentLocked)).toBe(true);
  });

  it('hands the root tail, milestones included, to the open space below', () => {
    expect(rootAppendRange(section([bar('a'), milestone('m')]))).toEqual({ from: 1, to: 2 });
  });
});

describe('edgeScrollSpeedY', () => {
  const rect = { top: 100, bottom: 900 } as DOMRect;

  it('does not scroll while the pointer is on a held schedule band', () => {
    // Axis ends at 148; bands run to 246
    expect(edgeScrollSpeedY(rect, 200, 246)).toBe(0);
  });

  it('scrolls up from the axis itself, and only from there while bands are held', () => {
    expect(edgeScrollSpeedY(rect, 120, 246)).toBeLessThan(0);
    // Just under the lowest band is where a pointer passes to reach it
    expect(edgeScrollSpeedY(rect, 260, 246)).toBe(0);
    expect(edgeScrollSpeedY(rect, 500, 246)).toBe(0);
  });

  it('scrolls up from just under the axis when nothing is held', () => {
    expect(edgeScrollSpeedY(rect, 160)).toBeLessThan(0);
    expect(edgeScrollSpeedY(rect, 400)).toBe(0);
  });

  it('scrolls down near the bottom, faster the further in', () => {
    const near = edgeScrollSpeedY(rect, 860);
    const far = edgeScrollSpeedY(rect, 899);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThanOrEqual(near);
  });
});

describe('schedule reorder', () => {
  it('needs a schedule passed by its middle, however tall it is', () => {
    const others = [
      { top: 0, height: 49 },
      { top: 49, height: 649 },
      { top: 698, height: 49 },
    ];
    expect(insertionIndex(30, others)).toBe(1);
    expect(insertionIndex(300, others)).toBe(1);
    expect(insertionIndex(400, others)).toBe(2);
    expect(insertionIndex(740, others)).toBe(3);
  });

  it('maps a drop among visible schedules onto the full list, pin included', () => {
    const all = [{ id: 'a' }, { id: 'pin' }, { id: 'b' }, { id: 'c' }];
    const visible = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    // a to the end
    expect(reorderIndices(all, visible, 'a', 2)).toEqual({ from: 0, to: 3 });
    // c to the front
    expect(reorderIndices(all, visible, 'c', 0)).toEqual({ from: 3, to: 0 });
    // b between a and c is where it already is
    expect(reorderIndices(all, visible, 'b', 1)).toEqual({ from: 2, to: 2 });
  });
});
