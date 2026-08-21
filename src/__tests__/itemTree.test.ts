import { describe, it, expect } from 'vitest';
import type { Section, TimelineItem } from '../types';
import {
  collectIds,
  countItems,
  findItem,
  findItemPath,
  insertItemInto,
  isWithin,
  itemDays,
  itemExtent,
  itemsExtent,
  locateItem,
  remapItemIds,
  removeItemFrom,
  sectionExtent,
  shiftItemDays,
  updateItemIn,
} from '../utils/itemTree';

function bar(
  id: string,
  start: string,
  end: string,
  children: TimelineItem[] = []
): TimelineItem {
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

const tree = (): TimelineItem[] => [
  bar('a', '2026-01-01', '2026-02-01', [
    bar('a1', '2026-01-05', '2026-01-10', [milestone('a1m', '2026-01-07')]),
    bar('a2', '2026-01-12', '2026-01-20'),
  ]),
  bar('b', '2026-02-01', '2026-03-01'),
  milestone('m', '2026-02-14'),
];

describe('itemTree lookup', () => {
  it('finds an item at any depth', () => {
    expect(findItem(tree(), 'a1m')?.name).toBe('a1m');
    expect(findItem(tree(), 'nope')).toBeNull();
  });

  it('returns the path from the root down to the item', () => {
    expect(findItemPath(tree(), 'a1m')?.map((i) => i.id)).toEqual(['a', 'a1', 'a1m']);
    expect(findItemPath(tree(), 'b')?.map((i) => i.id)).toEqual(['b']);
  });

  it('locates an item with its parent, siblings and depth', () => {
    const found = locateItem(tree(), 'a2');
    expect(found?.parent?.id).toBe('a');
    expect(found?.index).toBe(1);
    expect(found?.depth).toBe(1);
    expect(found?.siblings).toHaveLength(2);

    const root = locateItem(tree(), 'b');
    expect(root?.parent).toBeNull();
    expect(root?.index).toBe(1);
    expect(root?.depth).toBe(0);
  });

  it('collects every id in a subtree', () => {
    expect([...collectIds(tree()[0])].sort()).toEqual(['a', 'a1', 'a1m', 'a2']);
  });

  it('knows when one item is inside another', () => {
    expect(isWithin(tree(), 'a', 'a1m')).toBe(true);
    expect(isWithin(tree(), 'a', 'a')).toBe(true);
    expect(isWithin(tree(), 'a1', 'a2')).toBe(false);
    expect(isWithin(tree(), 'b', 'a')).toBe(false);
  });

  it('counts items at every depth', () => {
    expect(countItems(tree())).toBe(6);
  });
});

describe('itemTree mutation', () => {
  it('updates one item and leaves the identity of untouched branches alone', () => {
    const before = tree();
    const after = updateItemIn(before, 'a2', (item) => ({ ...item, name: 'renamed' }));
    expect(findItem(after, 'a2')?.name).toBe('renamed');
    // The sibling branch was not rebuilt, so React can skip it
    expect(after[1]).toBe(before[1]);
    expect(after[0]).not.toBe(before[0]);
  });

  it('returns the original array when nothing matched', () => {
    const before = tree();
    expect(updateItemIn(before, 'ghost', (item) => item)).toBe(before);
  });

  it('removes a nested item and hands back the subtree', () => {
    const { items, removed } = removeItemFrom(tree(), 'a1');
    expect(removed?.id).toBe('a1');
    expect(removed?.children).toHaveLength(1);
    expect(findItem(items, 'a1')).toBeNull();
    expect(findItem(items, 'a1m')).toBeNull();
    expect(findItem(items, 'a2')).not.toBeNull();
  });

  it('inserts at a root index', () => {
    const next = insertItemInto(tree(), null, 1, bar('new', '2026-01-01', '2026-01-02'));
    expect(next.map((i) => i.id)).toEqual(['a', 'new', 'b', 'm']);
  });

  it('clamps an out-of-range index to an append', () => {
    const next = insertItemInto(tree(), null, 99, bar('new', '2026-01-01', '2026-01-02'));
    expect(next[next.length - 1].id).toBe('new');
  });

  it('opens a parent it inserts into, so the new child is visible', () => {
    const collapsed = [bar('p', '2026-01-01', '2026-02-01', [bar('c', '2026-01-02', '2026-01-03')])];
    collapsed[0] = { ...collapsed[0], isCollapsed: true };
    const next = insertItemInto(collapsed, 'p', 0, bar('new', '2026-01-01', '2026-01-02'));
    expect(next[0].isCollapsed).toBe(false);
    expect(next[0].children.map((c) => c.id)).toEqual(['new', 'c']);
  });

  it('shifts a whole subtree by whole days', () => {
    const shifted = shiftItemDays(tree()[0], 10);
    expect(shifted.start).toBe('2026-01-11');
    expect(shifted.end).toBe('2026-02-11');
    expect(shifted.children[0].start).toBe('2026-01-15');
    expect(shifted.children[0].children[0].start).toBe('2026-01-17');
    expect(shifted.children[0].children[0].end).toBe('2026-01-17');
  });

  it('regenerates every id in a subtree', () => {
    let n = 0;
    const remapped = remapItemIds(tree()[0], () => `id-${(n += 1)}`);
    expect([...collectIds(remapped)]).toEqual(['id-1', 'id-2', 'id-3', 'id-4']);
    expect(remapped.name).toBe('a');
  });
});

describe('itemTree extents', () => {
  it('widens a bar to hold a child that pokes out of it', () => {
    const parent = bar('p', '2026-01-10', '2026-01-20', [bar('c', '2026-01-05', '2026-02-05')]);
    expect(itemExtent(parent)).toEqual({ start: '2026-01-05', end: '2026-02-05' });
  });

  it('spans a whole list', () => {
    expect(itemsExtent(tree())).toEqual({ start: '2026-01-01', end: '2026-03-01' });
    expect(itemsExtent([])).toBeNull();
  });

  it('widens a schedule window to hold items outside it', () => {
    const section = {
      id: 's',
      name: 'S',
      type: 'schedule',
      revision: 1,
      lastModifiedAt: '',
      order: 0,
      startDate: '2026-01-15',
      endDate: '2026-02-15',
      items: tree(),
      color: '#000',
      isCollapsed: false,
    } as Section;
    expect(sectionExtent(section)).toEqual({ start: '2026-01-01', end: '2026-03-01' });
  });

  it('measures a bar in days and a milestone as a point', () => {
    expect(itemDays(bar('x', '2026-01-01', '2026-01-08'))).toBe(7);
    expect(itemDays(milestone('x', '2026-01-01'))).toBe(0);
    // A zero-width bar still reads as one day so it can be seen and grabbed
    expect(itemDays(bar('x', '2026-01-01', '2026-01-01'))).toBe(1);
  });
});
