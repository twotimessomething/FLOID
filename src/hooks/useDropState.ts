import { useUIStore } from '../stores/uiStore';
import type { ClosedList } from '../utils/timelineUtils';

/**
 * Boolean subscriptions to the live drag.
 *
 * Every one of these reads a primitive, so a row only re-renders when its own
 * answer flips — which is what keeps a drag across a hundred rows cheap.
 *
 * What they read is the drop *indicator*, which is not always the drop target
 * itself: a slot that would leave the item exactly where it is shows nothing,
 * and a milestone headed for the root shows on the schedule's own row, because
 * that is where it will print.
 */

/**
 * True while this item is in flight — the one under the pointer, or anything
 * under it, since a group is lifted as one.
 */
export function useIsDragged(itemId: string): boolean {
  return useUIStore((s) => s.itemDrag.isActive && s.itemDrag.liftedIds.has(itemId));
}

/** True when releasing now would nest the dragged item inside this bar. */
export function useIsDropReceiver(itemId: string): boolean {
  return useUIStore((s) => s.itemDrag.dropKey === `into:${itemId}`);
}

function slotPrefix(sectionId: string, parentId: string | null): string {
  return `slot:${sectionId}:${parentId ?? 'root'}:`;
}

function slotIndex(key: string | null, prefix: string): number | null {
  if (key === null || !key.startsWith(prefix)) return null;
  const index = Number(key.slice(prefix.length));
  return Number.isInteger(index) ? index : null;
}

/**
 * True when releasing now would place the item in any of these sibling slots.
 * One edge can stand for several: the slots before root milestones that have no
 * row of their own all land at the next row that does.
 */
export function useIsDropSlotIn(
  sectionId: string,
  parentId: string | null,
  from: number,
  to: number
): boolean {
  const prefix = slotPrefix(sectionId, parentId);
  return useUIStore((s) => {
    const index = slotIndex(s.itemDrag.dropKey, prefix);
    return index !== null && index >= from && index <= to;
  });
}

/**
 * Which of the lists this row closes takes the drop, as that list's depth, or
 * -1. A row can close several groups at once — the last row of a nested group
 * that is itself last — and each of their tails is a different place to land.
 */
export function useDropClosingDepth(sectionId: string, closes: readonly ClosedList[]): number {
  return useUIStore((s) => {
    const key = s.itemDrag.dropKey;
    if (key === null || closes.length === 0) return -1;
    for (const list of closes) {
      const index = slotIndex(key, slotPrefix(sectionId, list.parentId));
      if (index !== null && index >= list.from && index <= list.to) return list.depth;
    }
    return -1;
  });
}

/** True when the drop lands on this schedule's own row. */
export function useIsDropHeader(sectionId: string): boolean {
  return useUIStore((s) => s.itemDrag.dropKey === `header:${sectionId}`);
}

export function useIsItemDragActive(): boolean {
  return useUIStore((s) => s.itemDrag.isActive);
}
