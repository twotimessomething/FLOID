import { describe, it, expect, beforeEach } from 'vitest';
import type { Section, TimelineItem } from '../types';
import { useSectionStore } from '../stores/sectionStore';
import { findItem, locateItem } from '../utils/itemTree';
import { dayDeltaForDrop } from '../hooks/useItemDrag';

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

function section(id: string, items: TimelineItem[]): Section {
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
  };
}

/** Ids of a parent's children, or of the schedule root when parentId is null. */
function childIds(sectionId: string, parentId: string | null): string[] {
  const found = useSectionStore.getState().sections.find((s) => s.id === sectionId);
  if (!found) return [];
  const list = parentId === null ? found.items : (findItem(found.items, parentId)?.children ?? []);
  return list.map((item) => item.id);
}

beforeEach(() => {
  useSectionStore.setState({
    sections: [
      section('s1', [
        bar('a', '2026-01-01', '2026-02-01'),
        bar('b', '2026-02-01', '2026-03-01', [bar('b1', '2026-02-05', '2026-02-10')]),
        bar('c', '2026-03-01', '2026-04-01'),
      ]),
      section('s2', [bar('x', '2026-01-01', '2026-02-01')]),
    ],
  });
  useSectionStore.temporal.getState().clear();
});

describe('moveItem — reordering among siblings', () => {
  const move = (itemId: string, toIndex: number): void =>
    useSectionStore.getState().moveItem({
      itemId,
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: null,
      toIndex,
      dayDelta: 0,
    });

  it('moves an item later, accounting for its own removal shifting the slots', () => {
    // Dropping "a" (index 0) below "b" resolves to slot 2; after "a" is lifted
    // out, slot 2 is one to the right of where it should land.
    move('a', 2);
    expect(childIds('s1', null)).toEqual(['b', 'a', 'c']);
  });

  it('moves an item earlier without adjustment', () => {
    move('c', 0);
    expect(childIds('s1', null)).toEqual(['c', 'a', 'b']);
  });

  it('treats a drop on its own slot as a no-op', () => {
    move('b', 1);
    expect(childIds('s1', null)).toEqual(['a', 'b', 'c']);
    move('b', 2);
    expect(childIds('s1', null)).toEqual(['a', 'b', 'c']);
  });

  it('appends past the end of the list', () => {
    move('a', 99);
    expect(childIds('s1', null)).toEqual(['b', 'c', 'a']);
  });
});

describe('moveItem — nesting', () => {
  it('nests one bar inside another and keeps its dates', () => {
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'b',
      toIndex: Number.MAX_SAFE_INTEGER,
      dayDelta: 0,
    });
    expect(childIds('s1', null)).toEqual(['b', 'c']);
    expect(childIds('s1', 'b')).toEqual(['b1', 'a']);
    expect(findItem(useSectionStore.getState().sections[0].items, 'a')?.start).toBe('2026-01-01');
  });

  it('carries the whole subtree out of a parent', () => {
    useSectionStore.getState().moveItem({
      itemId: 'b',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'a',
      toIndex: 0,
      dayDelta: 0,
    });
    expect(childIds('s1', 'a')).toEqual(['b']);
    expect(childIds('s1', 'b')).toEqual(['b1']);
  });

  it('promotes a nested item back to the root', () => {
    useSectionStore.getState().moveItem({
      itemId: 'b1',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: null,
      toIndex: 0,
      dayDelta: 0,
    });
    expect(childIds('s1', null)).toEqual(['b1', 'a', 'b', 'c']);
    expect(childIds('s1', 'b')).toEqual([]);
  });

  it('refuses to nest an item inside itself', () => {
    const before = childIds('s1', null);
    useSectionStore.getState().moveItem({
      itemId: 'b',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'b',
      toIndex: 0,
      dayDelta: 0,
    });
    expect(childIds('s1', null)).toEqual(before);
  });

  it('refuses to nest an item inside its own descendant', () => {
    const before = childIds('s1', null);
    useSectionStore.getState().moveItem({
      itemId: 'b',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'b1',
      toIndex: 0,
      dayDelta: 0,
    });
    expect(childIds('s1', null)).toEqual(before);
    expect(childIds('s1', 'b')).toEqual(['b1']);
  });

  it('opens a collapsed parent so the dropped item can be seen', () => {
    useSectionStore.getState().toggleItemCollapse('s1', 'b');
    expect(findItem(useSectionStore.getState().sections[0].items, 'b')?.isCollapsed).toBe(true);
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'b',
      toIndex: 0,
      dayDelta: 0,
    });
    expect(findItem(useSectionStore.getState().sections[0].items, 'b')?.isCollapsed).toBe(false);
  });
});

describe('moveItem — colour follows the group it joins', () => {
  const colorOf = (sectionIndex: number, itemId: string): string | null =>
    findItem(useSectionStore.getState().sections[sectionIndex].items, itemId)?.color ?? null;

  it('drops an explicit colour when the item joins a bar, so it takes the group ink', () => {
    useSectionStore.getState().updateItem('s1', 'a', { color: '#ff0000' });
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'b',
      toIndex: Number.MAX_SAFE_INTEGER,
      dayDelta: 0,
    });
    expect(colorOf(0, 'a')).toBeNull();
  });

  it('drops it again on the way back out, so the item rejoins the root palette', () => {
    useSectionStore.getState().updateItem('s1', 'b1', { color: '#00ff00' });
    useSectionStore.getState().moveItem({
      itemId: 'b1',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: null,
      toIndex: 0,
      dayDelta: 0,
    });
    expect(colorOf(0, 'b1')).toBeNull();
  });

  it('drops it when the item crosses into another schedule', () => {
    useSectionStore.getState().updateItem('s1', 'a', { color: '#ff0000' });
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's2',
      toParentId: null,
      toIndex: 0,
      dayDelta: 0,
    });
    expect(colorOf(1, 'a')).toBeNull();
  });

  it('keeps a deliberate colour when only the order changed', () => {
    useSectionStore.getState().updateItem('s1', 'a', { color: '#ff0000' });
    useSectionStore.getState().reorderItem('s1', 'a', 2);
    expect(childIds('s1', null)).toEqual(['b', 'a', 'c']);
    expect(colorOf(0, 'a')).toBe('#ff0000');
  });

  it('carries a child\'s own colour through the move — only the moved item re-inherits', () => {
    useSectionStore.getState().updateItem('s1', 'b1', { color: '#0000ff' });
    useSectionStore.getState().updateItem('s1', 'b', { color: '#ff0000' });
    useSectionStore.getState().moveItem({
      itemId: 'b',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'a',
      toIndex: 0,
      dayDelta: 0,
    });
    expect(colorOf(0, 'b')).toBeNull();
    expect(colorOf(0, 'b1')).toBe('#0000ff');
  });
});

describe('moveItem — across schedules', () => {
  it('moves a subtree into another schedule and shifts it in one step', () => {
    useSectionStore.getState().moveItem({
      itemId: 'b',
      fromSectionId: 's1',
      toSectionId: 's2',
      toParentId: null,
      toIndex: 0,
      dayDelta: 7,
    });

    expect(childIds('s1', null)).toEqual(['a', 'c']);
    expect(childIds('s2', null)).toEqual(['b', 'x']);

    const moved = findItem(useSectionStore.getState().sections[1].items, 'b');
    expect(moved?.start).toBe('2026-02-08');
    expect(moved?.children[0].start).toBe('2026-02-12');
  });

  it('nests into a bar in another schedule', () => {
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's2',
      toParentId: 'x',
      toIndex: Number.MAX_SAFE_INTEGER,
      dayDelta: 0,
    });
    expect(childIds('s1', null)).toEqual(['b', 'c']);
    expect(childIds('s2', 'x')).toEqual(['a']);
  });

  it('bumps the revision of both schedules it touched', () => {
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's2',
      toParentId: null,
      toIndex: 0,
      dayDelta: 0,
    });
    const [s1, s2] = useSectionStore.getState().sections;
    expect(s1.revision).toBe(2);
    expect(s2.revision).toBe(2);
  });
});

describe('item edits', () => {
  it('shifts an item and its children together', () => {
    useSectionStore.getState().shiftItem('s1', 'b', -3);
    const moved = findItem(useSectionStore.getState().sections[0].items, 'b');
    expect(moved?.start).toBe('2026-01-29');
    expect(moved?.children[0].start).toBe('2026-02-02');
  });

  it('resizes one bar without moving its children', () => {
    useSectionStore.getState().setItemDates('s1', 'b', '2026-02-01', '2026-05-01');
    const resized = findItem(useSectionStore.getState().sections[0].items, 'b');
    expect(resized?.end).toBe('2026-05-01');
    expect(resized?.children[0].start).toBe('2026-02-05');
  });

  it('never lets a bar collapse to nothing', () => {
    useSectionStore.getState().setItemDates('s1', 'a', '2026-01-10', '2026-01-10');
    const item = findItem(useSectionStore.getState().sections[0].items, 'a');
    expect(item?.start).toBe('2026-01-10');
    expect(item?.end).toBe('2026-01-11');
  });

  it('keeps a milestone a single point when only one edge is set', () => {
    useSectionStore.getState().addItem('s1', null, {
      kind: 'milestone',
      name: 'M',
      description: '',
      start: '2026-06-01',
      end: '2026-06-01',
      color: null,
      isCollapsed: false,
    });
    const rootItems = useSectionStore.getState().sections[0].items;
    const id = rootItems[rootItems.length - 1].id;
    useSectionStore.getState().updateItem('s1', id, { start: '2026-07-04' });
    const marker = findItem(useSectionStore.getState().sections[0].items, id);
    expect(marker?.start).toBe('2026-07-04');
    expect(marker?.end).toBe('2026-07-04');
  });

  it('deletes an item together with everything under it', () => {
    useSectionStore.getState().deleteItem('s1', 'b');
    const items = useSectionStore.getState().sections[0].items;
    expect(findItem(items, 'b')).toBeNull();
    expect(findItem(items, 'b1')).toBeNull();
  });

  it('inserts at an explicit slot', () => {
    useSectionStore.getState().addItem(
      's1',
      null,
      {
        kind: 'bar',
        name: 'new',
        description: '',
        start: '2026-01-01',
        end: '2026-01-08',
        color: null,
        isCollapsed: false,
      },
      1
    );
    expect(childIds('s1', null)).toEqual(['a', expect.any(String), 'b', 'c'] as never);
  });

  it('reorders through the same path a drag commits through', () => {
    useSectionStore.getState().reorderItem('s1', 'a', 2);
    expect(childIds('s1', null)).toEqual(['b', 'a', 'c']);
    expect(locateItem(useSectionStore.getState().sections[0].items, 'a')?.parent).toBeNull();
  });
});

describe('schedule window', () => {
  it('re-declares the window without moving anything', () => {
    useSectionStore.getState().updateSectionWindow('s1', '2026-06-01', '2026-01-01');
    const s1 = useSectionStore.getState().sections[0];
    // Reversed input is normalised rather than rejected
    expect(s1.startDate).toBe('2026-01-01');
    expect(s1.endDate).toBe('2026-06-01');
    expect(findItem(s1.items, 'a')?.start).toBe('2026-01-01');
    expect(findItem(s1.items, 'c')?.end).toBe('2026-04-01');
  });
});

describe('dayDeltaForDrop — what horizontal travel means', () => {
  const into = { kind: 'into', sectionId: 's1', parentId: 'b' } as const;
  const slot = { kind: 'slot', sectionId: 's1', parentId: null, index: 1 } as const;

  it('ignores the travel it took to reach a bar', () => {
    // Aiming at a bar 300px away is not a request to move 50 days
    expect(dayDeltaForDrop(into, 300, 6)).toBe(0);
    expect(dayDeltaForDrop(into, -300, 6)).toBe(0);
  });

  it('honours the pointer along a row, which spans the whole timeline', () => {
    expect(dayDeltaForDrop(slot, 300, 6)).toBe(50);
    expect(dayDeltaForDrop(slot, -300, 6)).toBe(-50);
  });

  it('keeps a drag with no drop target moving in time', () => {
    expect(dayDeltaForDrop(null, 120, 6)).toBe(20);
  });

  it('rounds to whole days, so bars land on gridlines', () => {
    expect(dayDeltaForDrop(slot, 15, 6)).toBe(3);
    expect(dayDeltaForDrop(slot, 14, 6)).toBe(2);
  });

  it('moves nothing when there is no time axis under the pointer', () => {
    // A drag started from the labels column only ever re-parents
    expect(dayDeltaForDrop(slot, 400, 0)).toBe(0);
  });
});
