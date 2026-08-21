import type { Section, TimelineItem } from '../types/timeline';
import { addDaysToKey, dayKeyDiff, maxDayKey, minDayKey } from './dayKeys';

/**
 * Pure operations on the item tree.
 *
 * Everything here returns new arrays — the store composes these rather than
 * hand-writing nested `.map` chains, which is where the old model's bugs bred.
 */

export interface ItemLocation {
  /** null when the item sits at the root of the schedule. */
  readonly parent: TimelineItem | null;
  readonly siblings: readonly TimelineItem[];
  readonly index: number;
  readonly depth: number;
}

export function findItem(items: readonly TimelineItem[], id: string): TimelineItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const found = findItem(item.children, id);
    if (found) return found;
  }
  return null;
}

/** Ancestors from the root down to, and including, the item itself. */
export function findItemPath(
  items: readonly TimelineItem[],
  id: string,
  trail: TimelineItem[] = []
): TimelineItem[] | null {
  for (const item of items) {
    const next = [...trail, item];
    if (item.id === id) return next;
    const found = findItemPath(item.children, id, next);
    if (found) return found;
  }
  return null;
}

export function locateItem(
  items: readonly TimelineItem[],
  id: string,
  parent: TimelineItem | null = null,
  depth = 0
): ItemLocation | null {
  const index = items.findIndex((item) => item.id === id);
  if (index !== -1) return { parent, siblings: items, index, depth };

  for (const item of items) {
    const found = locateItem(item.children, id, item, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Every id in the subtree, including the root's own. */
export function collectIds(item: TimelineItem, into: Set<string> = new Set()): Set<string> {
  into.add(item.id);
  for (const child of item.children) collectIds(child, into);
  return into;
}

/** True when `ancestorId` is the item itself or one of its ancestors. */
export function isWithin(items: readonly TimelineItem[], ancestorId: string, id: string): boolean {
  const ancestor = findItem(items, ancestorId);
  if (!ancestor) return false;
  return collectIds(ancestor).has(id);
}

/** Replace one item in place, leaving the rest of the tree untouched. */
export function updateItemIn(
  items: readonly TimelineItem[],
  id: string,
  updater: (item: TimelineItem) => TimelineItem
): TimelineItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.id === id) {
      changed = true;
      return updater(item);
    }
    const children = updateItemIn(item.children, id, updater);
    if (children !== item.children) {
      changed = true;
      return { ...item, children };
    }
    return item;
  });
  return changed ? next : (items as TimelineItem[]);
}

export function removeItemFrom(
  items: readonly TimelineItem[],
  id: string
): { items: TimelineItem[]; removed: TimelineItem | null } {
  const index = items.findIndex((item) => item.id === id);
  if (index !== -1) {
    const next = [...items];
    const [removed] = next.splice(index, 1);
    return { items: next, removed };
  }

  let removed: TimelineItem | null = null;
  const next = items.map((item) => {
    if (removed) return item;
    const result = removeItemFrom(item.children, id);
    if (result.removed) {
      removed = result.removed;
      return { ...item, children: result.items };
    }
    return item;
  });
  return { items: removed ? next : (items as TimelineItem[]), removed };
}

/**
 * Insert into a parent's children (or the root list when parentId is null).
 * An out-of-range index appends, which is what every "drop past the last row"
 * gesture resolves to.
 */
export function insertItemInto(
  items: readonly TimelineItem[],
  parentId: string | null,
  index: number,
  item: TimelineItem
): TimelineItem[] {
  if (parentId === null) {
    const next = [...items];
    next.splice(clampIndex(index, next.length), 0, item);
    return next;
  }

  return updateItemIn(items, parentId, (parent) => {
    const children = [...parent.children];
    children.splice(clampIndex(index, children.length), 0, item);
    return { ...parent, children, isCollapsed: false };
  });
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.round(index), length);
}

/** Shift an item and everything under it by a whole number of days. */
export function shiftItemDays(item: TimelineItem, days: number): TimelineItem {
  if (days === 0) return item;
  return {
    ...item,
    start: addDaysToKey(item.start, days),
    end: addDaysToKey(item.end, days),
    children: item.children.map((child) => shiftItemDays(child, days)),
  };
}

/** Regenerate every id in a subtree — used when importing or duplicating. */
export function remapItemIds(item: TimelineItem, generateId: () => string): TimelineItem {
  return {
    ...item,
    id: generateId(),
    children: item.children.map((child) => remapItemIds(child, generateId)),
  };
}

export interface DateExtent {
  readonly start: string;
  readonly end: string;
}

/** The span an item covers once its descendants are taken into account. */
export function itemExtent(item: TimelineItem): DateExtent {
  let start = item.start;
  let end = item.end;
  for (const child of item.children) {
    const childExtent = itemExtent(child);
    start = minDayKey(start, childExtent.start);
    end = maxDayKey(end, childExtent.end);
  }
  return { start, end };
}

export function itemsExtent(items: readonly TimelineItem[]): DateExtent | null {
  if (items.length === 0) return null;
  let start: string | null = null;
  let end: string | null = null;
  for (const item of items) {
    const extent = itemExtent(item);
    start = start === null ? extent.start : minDayKey(start, extent.start);
    end = end === null ? extent.end : maxDayKey(end, extent.end);
  }
  return start && end ? { start, end } : null;
}

/**
 * A schedule's real span: its declared window widened to hold every item.
 * Items are never clamped to the window, so the window alone would clip them.
 */
export function sectionExtent(section: Section): DateExtent {
  const items = itemsExtent(section.items);
  if (!items) return { start: section.startDate, end: section.endDate };
  return {
    start: minDayKey(section.startDate, items.start),
    end: maxDayKey(section.endDate, items.end),
  };
}

export function sectionsExtent(sections: readonly Section[]): DateExtent | null {
  if (sections.length === 0) return null;
  let start: string | null = null;
  let end: string | null = null;
  for (const section of sections) {
    const extent = sectionExtent(section);
    start = start === null ? extent.start : minDayKey(start, extent.start);
    end = end === null ? extent.end : maxDayKey(end, extent.end);
  }
  return start && end ? { start, end } : null;
}

/** Duration in days. A milestone is 0; a bar is at least 1. */
export function itemDays(item: TimelineItem): number {
  if (item.kind === 'milestone') return 0;
  return Math.max(1, dayKeyDiff(item.start, item.end));
}

/** Walk every item in the tree, depth first. */
export function forEachItem(
  items: readonly TimelineItem[],
  visit: (item: TimelineItem, parent: TimelineItem | null, depth: number) => void,
  parent: TimelineItem | null = null,
  depth = 0
): void {
  for (const item of items) {
    visit(item, parent, depth);
    forEachItem(item.children, visit, item, depth + 1);
  }
}

/** Total item count in a schedule, at every depth. */
export function countItems(items: readonly TimelineItem[]): number {
  let count = 0;
  forEachItem(items, () => {
    count += 1;
  });
  return count;
}
