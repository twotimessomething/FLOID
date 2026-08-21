import { useUIStore } from '../stores/uiStore';

/**
 * Boolean subscriptions to the live drag.
 *
 * Every one of these reads a primitive, so a row only re-renders when its own
 * answer flips — which is what keeps a drag across a hundred rows cheap.
 */

/** True while this item is the one in flight. */
export function useIsDragged(itemId: string): boolean {
  return useUIStore((s) => s.itemDrag.isActive && s.itemDrag.itemId === itemId);
}

/** True when releasing now would nest the dragged item inside this bar. */
export function useIsDropReceiver(itemId: string): boolean {
  return useUIStore((s) => s.itemDrag.dropKey === `into:${itemId}`);
}

/** True when releasing now would place the item in this exact sibling slot. */
export function useIsDropSlot(
  sectionId: string,
  parentId: string | null,
  index: number
): boolean {
  const key = `slot:${sectionId}:${parentId ?? 'root'}:${index}`;
  return useUIStore((s) => s.itemDrag.dropKey === key);
}

export function useIsItemDragActive(): boolean {
  return useUIStore((s) => s.itemDrag.isActive);
}
